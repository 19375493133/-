from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from glob import glob
from pathlib import Path

from ..config import settings


class FFmpegNotFoundError(RuntimeError):
    pass


class AudioMergeError(RuntimeError):
    pass


def find_ffmpeg() -> str | None:
    configured = settings.ffmpeg_path
    if configured and Path(configured).is_file():
        return str(Path(configured).resolve())

    found = shutil.which("ffmpeg")
    if found:
        return found

    # Windows 常见安装位置；避免完全依赖 PATH。
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    candidates: list[Path] = []
    if local_app_data:
        packages_root = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
        candidates.extend(
            Path(item)
            for pattern in (
                str(packages_root / "Gyan.FFmpeg_*" / "ffmpeg-*-full_build" / "bin" / "ffmpeg.exe"),
                str(packages_root / "*FFmpeg*" / "*" / "bin" / "ffmpeg.exe"),
            )
            for item in glob(pattern)
        )
    candidates.append(Path("C:/ffmpeg/bin/ffmpeg.exe"))
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _escape_ffmpeg_path(path: Path) -> str:
    # ffmpeg concat 列表中的单引号需要转义。
    return path.as_posix().replace("'", "'\\''")


def merge_chunks_to_wav(
    chunks: list[Path],
    output_path: Path,
    *,
    ffmpeg_path: str | None = None,
) -> None:
    ffmpeg = ffmpeg_path or find_ffmpeg()
    if not ffmpeg:
        raise FFmpegNotFoundError(
            "未检测到 ffmpeg，无法合并/转换音频。请先安装 ffmpeg，"
            "或在 .env 中设置 FFMPEG_PATH 指向可执行文件。"
        )

    if not chunks:
        raise AudioMergeError("没有可合并的音频分片。")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    list_path = output_path.with_suffix(".txt")
    try:
        list_path.write_text(
            "\n".join(f"file '{_escape_ffmpeg_path(chunk)}'" for chunk in chunks) + "\n",
            encoding="utf-8",
        )
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            stderr = result.stderr.strip() or "ffmpeg 执行失败，未返回错误详情。"
            raise AudioMergeError(stderr)
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise AudioMergeError("ffmpeg 执行完成，但未生成有效音频文件。")
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AudioMergeError(f"音频合并失败：{exc}") from exc
    finally:
        list_path.unlink(missing_ok=True)
