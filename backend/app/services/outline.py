"""把课堂记录整理成 Markdown 大纲。

这里只做**规则化整理**（结构、时间轴、关键词命中），不调用任何大模型；
LLM 增强在 `services/llm.py` 中，由 `/api/sessions/{id}/mindmap` 按配置决定是否启用。
产出的 Markdown 直接交给前端 markmap 渲染成思维导图。
"""

from __future__ import annotations

from collections.abc import Sequence

from ..models import Highlight, Session, TranscriptionSegment

HIGHLIGHT_SECTIONS: tuple[tuple[str, str], ...] = (
    ("important", "重点"),
    ("difficult", "难点"),
    ("question", "问题"),
    ("note", "笔记"),
)

# 关键词命中，用来把「作业 / 考试提示」单独拎出来（不是 LLM 语义分析）。
HINT_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("作业 / 任务", ("作业", "任务", "提交", "deadline", "截止")),
    ("考试 / 考点", ("考试", "考点", "测验", "期末", "期中", "考核", "复习")),
    ("下节课 / 预告", ("下节课", "下次课", "预习", "下回")),
)

MAX_TRANSCRIPT_SEGMENTS = 120
MAX_SEGMENT_CHARS = 160
SEGMENTS_PER_BLOCK = 6

# 结构化要点（来自 analysis_results）按这个顺序成节。
POINT_SECTIONS: tuple[tuple[str, str], ...] = (
    ("key_point", "重点"),
    ("difficult", "难点"),
    ("example", "例子"),
    ("homework", "作业"),
    ("exam", "考试提示"),
    ("term", "术语"),
)


def format_timestamp(seconds: float) -> str:
    """秒 -> mm:ss（超过一小时显示 hh:mm:ss）。"""
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _one_line(text: str, limit: int = MAX_SEGMENT_CHARS) -> str:
    """压成一行，避免换行符破坏 Markdown 大纲结构。"""
    collapsed = " ".join(str(text).split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1] + "…"


def _session_info_lines(session: Session) -> list[str]:
    return [
        f"- 课程：{_one_line(session.course) or '未填写'}",
        f"- 教师：{_one_line(session.teacher) or '未填写'}",
        f"- 日期：{_one_line(session.date) or '未填写'}",
        f"- 录音时长：{format_timestamp(session.duration)}",
    ]


def _highlight_lines(highlights: Sequence[Highlight]) -> list[str]:
    lines: list[str] = ["## 课堂标记", ""]
    has_any = False
    for highlight_type, label in HIGHLIGHT_SECTIONS:
        items = [item for item in highlights if item.type == highlight_type]
        if not items:
            continue
        has_any = True
        lines.append(f"### {label}")
        lines.append("")
        for item in items:
            speaker = f"（{_one_line(item.speaker, 20)}）" if item.speaker else ""
            lines.append(
                f"- [{format_timestamp(item.timestamp_seconds)}] "
                f"{_one_line(item.content)}{speaker}"
            )
        lines.append("")
    if not has_any:
        lines.append("- 暂无课堂标记（录音过程中可以标记重点、难点、问题或笔记）")
        lines.append("")
    return lines


def _hint_lines(segments: Sequence[TranscriptionSegment]) -> list[str]:
    lines: list[str] = []
    used_ids: set[str] = set()
    for label, keywords in HINT_KEYWORDS:
        matches = [
            segment
            for segment in segments
            if segment.id not in used_ids
            and any(keyword in segment.text for keyword in keywords)
        ]
        if not matches:
            continue
        used_ids.update(segment.id for segment in matches)
        lines.append(f"### {label}")
        lines.append("")
        for segment in matches[:5]:
            lines.append(
                f"- [{format_timestamp(segment.start_seconds)}] {_one_line(segment.text)}"
            )
        lines.append("")
    return lines


def _transcript_lines(segments: Sequence[TranscriptionSegment]) -> list[str]:
    lines: list[str] = ["## 老师讲解", ""]
    if not segments:
        lines.append("- 暂无转写内容：开启实时转写或录音后重新生成，这里会按时间轴展开。")
        lines.append("")
        return lines

    selected = list(segments[:MAX_TRANSCRIPT_SEGMENTS])
    for start in range(0, len(selected), SEGMENTS_PER_BLOCK):
        block = selected[start : start + SEGMENTS_PER_BLOCK]
        if not block:
            continue
        start_seconds = block[0].start_seconds
        end_seconds = block[-1].end_seconds
        lines.append(
            f"### {format_timestamp(start_seconds)} - {format_timestamp(end_seconds)}"
        )
        lines.append("")
        for segment in block:
            lines.append(f"- {_one_line(segment.text)}")
        lines.append("")

    if len(segments) > MAX_TRANSCRIPT_SEGMENTS:
        lines.append(
            f"- （还有 {len(segments) - MAX_TRANSCRIPT_SEGMENTS} 段转写未展示，"
            "完整内容见会话详情页）"
        )
        lines.append("")
    return lines


def build_outline_markdown(
    session: Session,
    highlights: Sequence[Highlight],
    segments: Sequence[TranscriptionSegment],
    points: Sequence[tuple[str, str, float]] | None = None,
) -> str:
    """生成 markmap 可以直接渲染的 Markdown 大纲。

    `points` 是结构化要点 `(category, text, start_seconds)`：有它就按
    「重点 / 难点 / 例子 / 作业 / 考试提示 / 术语」成节（open-notebook 那种先出重点的思路），
    没有就退回规则化的课堂标记 + 关键词命中。
    """
    lines: list[str] = [f"# {_one_line(session.title) or '听课会话'}", ""]

    lines.append("## 课程信息")
    lines.append("")
    lines.extend(_session_info_lines(session))
    lines.append("")

    if points:
        for category, label in POINT_SECTIONS:
            items = [item for item in points if item[0] == category]
            if not items:
                continue
            lines.append(f"## {label}（{len(items)}）")
            lines.append("")
            for _category, text, start_seconds in items:
                lines.append(f"- [{format_timestamp(start_seconds)}] {text}")
            lines.append("")
    else:
        lines.extend(_highlight_lines(highlights))

        hint_lines = _hint_lines(segments)
        if hint_lines:
            lines.append("## 作业与考试提示")
            lines.append("")
            lines.extend(hint_lines)

    lines.extend(_transcript_lines(segments))

    return "\n".join(lines).rstrip() + "\n"


def build_outline_prompt(
    session: Session,
    highlights: Sequence[Highlight],
    segments: Sequence[TranscriptionSegment],
) -> str:
    """给 LLM 的用户消息：把课堂材料压缩成一段可读文本。"""
    parts: list[str] = [
        f"课程：{_one_line(session.course) or '未填写'}",
        f"教师：{_one_line(session.teacher) or '未填写'}",
        f"日期：{_one_line(session.date) or '未填写'}",
        f"录音时长：{format_timestamp(session.duration)}",
        "",
        "【课堂标记】",
    ]
    if highlights:
        for item in highlights:
            parts.append(
                f"- [{format_timestamp(item.timestamp_seconds)}] "
                f"{_one_line(item.content, 120)}"
            )
    else:
        parts.append("- 无")

    parts.append("")
    parts.append("【课堂转写（按时间顺序）】")
    if segments:
        for segment in segments[:MAX_TRANSCRIPT_SEGMENTS]:
            parts.append(
                f"[{format_timestamp(segment.start_seconds)}] {_one_line(segment.text)}"
            )
    else:
        parts.append("（无转写内容）")

    return "\n".join(parts)


OUTLINE_SYSTEM_PROMPT = (
    "你是大学课堂笔记整理助手。请把用户提供的课堂记录整理成 Markdown 大纲，"
    "用于渲染思维导图。要求：\n"
    "1. 只输出 Markdown，不要解释、不要代码块围栏；\n"
    "2. 第一行是 `# 课程主题`，之后用 `##`、`###` 分级，最多三层；\n"
    "3. 章节名称用中文，例如：课程信息、课堂重点、难点、例子、作业与考试提示、知识结构；\n"
    "4. 每个要点用 `-` 列表项，尽量保留关键时间戳（形如 00:12）和课堂原话关键词；\n"
    "5. 只使用材料中出现的信息，不要编造没有出现的知识点、作业或考试信息。"
)
