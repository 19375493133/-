"""把 FunASR 流式模型输出的碎片合并成句子。

`paraformer-zh-streaming` 每 600ms 就吐一小段文字，而且不带标点。如果每段都当成
一句 final，18 秒讲话就会落库 26 条字幕。这里按“字数 / 时长”聚合成一句，既方便
阅读，也让后续思维导图有完整句子可用。

该模块只依赖标准库，方便单独跑单元测试。
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

SENTENCE_ENDINGS = ("。", "！", "？", "!", "?", "；", ";", "…", "\n")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


@dataclass
class SentenceBuffer:
    """累积句子，直到字数或时长达到阈值。"""

    max_chars: int = field(default_factory=lambda: _env_int("FUNASR_FINAL_MAX_CHARS", 20))
    max_seconds: float = field(
        default_factory=lambda: _env_float("FUNASR_FINAL_MAX_SECONDS", 5.0)
    )
    min_seconds_for_punctuation: float = 1.0
    text: str = ""
    start_ms: int = 0
    end_ms: int = 0

    def append(self, piece: str, start_ms: int, end_ms: int) -> None:
        clean = (piece or "").strip()
        if not clean:
            return
        if not self.text:
            self.start_ms = max(0, start_ms)
        self.text = f"{self.text}{clean}"
        self.end_ms = max(self.end_ms, end_ms)

    @property
    def duration_seconds(self) -> float:
        return max(0.0, (self.end_ms - self.start_ms) / 1000.0)

    def should_flush(self) -> bool:
        if not self.text:
            return False
        if self.text.endswith(SENTENCE_ENDINGS):
            return self.duration_seconds >= self.min_seconds_for_punctuation
        return len(self.text) >= self.max_chars or self.duration_seconds >= self.max_seconds

    def flush(self) -> tuple[str, int, int] | None:
        if not self.text:
            return None
        payload = (self.text, self.start_ms, self.end_ms)
        self.text = ""
        self.start_ms = 0
        self.end_ms = 0
        return payload


def diff_increment(previous: str, current: str) -> str:
    """返回 `current` 相对 `previous` 新增的部分。

    流式模型给出的是累计文本，而且偶尔会回改结尾，所以按最长公共前缀求增量，
    比简单 `startswith` 更稳。
    """
    current = (current or "").strip()
    if not current:
        return ""
    previous = previous or ""
    common = 0
    for left, right in zip(previous, current, strict=False):
        if left != right:
            break
        common += 1
    return current[common:].strip()
