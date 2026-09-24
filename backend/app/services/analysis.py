"""课堂重点提取（借鉴 open-notebook 的结构化思路）。

分成两步，职责清晰：

1. **出重点**：把课堂标记 + 转写整理成结构化的要点（重点 / 难点 / 例子 / 作业 / 考试提示 / 术语）。
   规则版不调用模型；配置了 LLM 时可以让模型直接输出 JSON 要点。
2. **出图**：把要点 + 时间轴拼成 Markdown，交给前端 markmap 渲染（这一步在 outline.py）。

结构化而不是直接吐 Markdown 的好处：重点可以单独存库、单独展示、复用做卡片和复习清单。
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass

from ..models import Highlight, Session, TranscriptionSegment
from .llm import LLMSettings, chat_completion, load_llm_settings
from .outline import format_timestamp

CATEGORY_LABELS: dict[str, str] = {
    "key_point": "重点",
    "difficult": "难点",
    "example": "例子",
    "homework": "作业",
    "exam": "考试提示",
    "term": "术语",
}

HIGHLIGHT_TO_CATEGORY = {
    "important": "key_point",
    "difficult": "difficult",
    "question": "exam",
    "note": "term",
}

KEYWORD_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("homework", ("作业", "任务", "提交", "截止", "deadline")),
    ("exam", ("考试", "考点", "测验", "期中", "期末", "考核", "复习", "预习")),
    ("example", ("例如", "比如", "举个例子", "举例", "例子")),
    ("key_point", ("定义", "定理", "公式", "性质", "结论", "叫做", "称为")),
    ("term", ("术语", "概念", "记作", "符号")),
)

MAX_POINTS = 24
MAX_TRANSCRIPT_SEGMENTS = 120
MAX_TEXT_CHARS = 120


@dataclass
class AnalysisPoint:
    category: str
    text: str
    start_seconds: float = 0.0
    source: str = "local"


def _one_line(text: str, limit: int = MAX_TEXT_CHARS) -> str:
    collapsed = " ".join(str(text).split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1] + "…"


def _dedupe(points: list[AnalysisPoint]) -> list[AnalysisPoint]:
    seen: set[str] = set()
    result: list[AnalysisPoint] = []
    for point in points:
        key = f"{point.category}:{point.text}"
        if point.text and key not in seen:
            seen.add(key)
            result.append(point)
    return result


def extract_local_points(
    session: Session,
    highlights: Sequence[Highlight],
    segments: Sequence[TranscriptionSegment],
    *,
    limit: int = MAX_POINTS,
) -> list[AnalysisPoint]:
    """规则版重点提取：不调用任何模型，可离线跑。"""
    points: list[AnalysisPoint] = []

    for highlight in highlights:
        points.append(
            AnalysisPoint(
                category=HIGHLIGHT_TO_CATEGORY.get(highlight.type, "key_point"),
                text=_one_line(highlight.content),
                start_seconds=float(highlight.timestamp_seconds or 0.0),
            )
        )

    # 一句话只归到第一个命中的分类，避免「作业是第三题，下节课预习」既算作业又算考试提示。
    used_segment_ids: set[str] = set()
    for category, keywords in KEYWORD_RULES:
        for segment in segments[:MAX_TRANSCRIPT_SEGMENTS]:
            if segment.id in used_segment_ids:
                continue
            if any(keyword in segment.text for keyword in keywords):
                used_segment_ids.add(segment.id)
                points.append(
                    AnalysisPoint(
                        category=category,
                        text=_one_line(segment.text),
                        start_seconds=float(segment.start_seconds or 0.0),
                    )
                )

    deduped = _dedupe(points)
    deduped.sort(key=lambda item: item.start_seconds)
    return deduped[:limit]


POINTS_SYSTEM_PROMPT = (
    "你是大学课堂重点提取助手。请把用户提供的课堂记录整理成结构化要点，"
    "只输出一个 JSON 数组，不要输出解释或代码块。\n"
    "每个元素形如：\n"
    '{"category":"key_point","text":"极限的定义：自变量趋近某值时函数值的确定趋势","start_seconds":45}\n'
    "category 只能取：key_point（重点）、difficult（难点）、example（例子）、"
    "homework（作业）、exam（考试提示）、term（术语）。\n"
    "要求：\n"
    "1. text 用一句中文，尽量保留老师的原话关键词与时间戳对应的内容；\n"
    "2. start_seconds 是这句话在录音里的秒数，不确定就填 0；\n"
    "3. 最多 24 条，按时间顺序排列；\n"
    "4. 只使用材料里出现过的信息，不要编造知识点、作业或考试内容。"
)


def build_points_prompt(
    session: Session,
    highlights: Sequence[Highlight],
    segments: Sequence[TranscriptionSegment],
) -> str:
    lines = [
        f"课程：{_one_line(session.course) or '未填写'}",
        f"教师：{_one_line(session.teacher) or '未填写'}",
        "",
        "【课堂标记】",
    ]
    if highlights:
        for item in highlights:
            lines.append(
                f"- [{format_timestamp(item.timestamp_seconds)}] {_one_line(item.content)}"
            )
    else:
        lines.append("- 无")

    lines.append("")
    lines.append("【课堂转写】")
    if segments:
        for segment in segments[:MAX_TRANSCRIPT_SEGMENTS]:
            lines.append(
                f"[{format_timestamp(segment.start_seconds)}] {_one_line(segment.text)}"
            )
    else:
        lines.append("（无转写内容）")
    return "\n".join(lines)


_JSON_ARRAY_PATTERN = re.compile(r"\[.*\]", re.DOTALL)


def parse_points_json(raw: str, *, source: str = "llm") -> list[AnalysisPoint] | None:
    """宽松解析模型返回的 JSON 数组。"""
    text = (raw or "").strip()
    text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()
    match = _JSON_ARRAY_PATTERN.search(text)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except ValueError:
        return None
    if not isinstance(data, list):
        return None

    points: list[AnalysisPoint] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category") or "key_point").strip()
        if category not in CATEGORY_LABELS:
            category = "key_point"
        content = _one_line(str(item.get("text") or "").strip())
        if not content:
            continue
        try:
            start_seconds = max(0.0, float(item.get("start_seconds") or 0.0))
        except (TypeError, ValueError):
            start_seconds = 0.0
        points.append(
            AnalysisPoint(
                category=category,
                text=content,
                start_seconds=start_seconds,
                source=source,
            )
        )
    return _dedupe(points)[:MAX_POINTS] or None


def extract_llm_points(
    session: Session,
    highlights: Sequence[Highlight],
    segments: Sequence[TranscriptionSegment],
    *,
    settings: LLMSettings | None = None,
) -> tuple[list[AnalysisPoint] | None, str | None]:
    """让模型输出结构化要点，返回 (要点列表, 错误)。"""
    prompt = build_points_prompt(session, highlights, segments)
    content, error = chat_completion(
        POINTS_SYSTEM_PROMPT, prompt, settings=settings or load_llm_settings()
    )
    if content is None:
        return None, error
    points = parse_points_json(content)
    if not points:
        return None, "LLM 返回的内容不是可用的要点 JSON"
    return points, None
