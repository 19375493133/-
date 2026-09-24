from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "sentence_buffer.py"
_spec = importlib.util.spec_from_file_location("sentence_buffer", MODULE_PATH)
assert _spec is not None and _spec.loader is not None
sentence_buffer = importlib.util.module_from_spec(_spec)
# dataclass 处理字符串注解时会查 sys.modules，必须先注册再执行。
sys.modules["sentence_buffer"] = sentence_buffer
_spec.loader.exec_module(sentence_buffer)

SentenceBuffer = sentence_buffer.SentenceBuffer
diff_increment = sentence_buffer.diff_increment


def test_diff_increment_returns_new_tail() -> None:
    assert diff_increment("今天我们讲", "今天我们讲函数") == "函数"
    assert diff_increment("", "今天我们讲") == "今天我们讲"
    assert diff_increment("今天我们讲函数", "今天我们讲函数") == ""


def test_diff_increment_handles_rewritten_ending() -> None:
    # 流式模型偶尔会回改结尾，按公共前缀求增量不会重复输出整句。
    assert diff_increment("今天我们讲函数的极限", "今天我们讲函数的极限制") == "制"


def test_flush_when_char_limit_reached() -> None:
    buffer = SentenceBuffer(max_chars=6, max_seconds=60.0)
    buffer.append("今天我们讲", 0, 600)
    assert buffer.should_flush() is False
    buffer.append("函数的极限", 600, 1200)
    assert buffer.should_flush() is True
    assert buffer.flush() == ("今天我们讲函数的极限", 0, 1200)
    assert buffer.flush() is None


def test_flush_when_duration_limit_reached() -> None:
    buffer = SentenceBuffer(max_chars=100, max_seconds=5.0)
    buffer.append("短句", 0, 1000)
    assert buffer.should_flush() is False
    buffer.append("还在讲", 1000, 6200)
    assert buffer.should_flush() is True


def test_punctuation_flushes_early() -> None:
    buffer = SentenceBuffer(max_chars=100, max_seconds=60.0)
    buffer.append("第一个知识点讲完了。", 0, 2000)
    assert buffer.should_flush() is True


def test_punctuation_short_piece_waits() -> None:
    buffer = SentenceBuffer(max_chars=100, max_seconds=60.0)
    buffer.append("。", 0, 200)
    assert buffer.should_flush() is False


def test_append_ignores_blank_pieces() -> None:
    buffer = SentenceBuffer()
    buffer.append("   ", 0, 600)
    assert buffer.text == ""
    assert buffer.should_flush() is False
