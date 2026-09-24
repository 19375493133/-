from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("WHISPER_MODEL", "base")
    os.environ.setdefault("WHISPER_DEVICE", "cpu")
    os.environ.setdefault("WHISPER_COMPUTE_TYPE", "int8")

    log_path = Path(__file__).resolve().parent.parent / "data" / "logs" / "whisper.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file
    uvicorn.run("app:app", host="127.0.0.1", port=8001, reload=False)


if __name__ == "__main__":
    main()

