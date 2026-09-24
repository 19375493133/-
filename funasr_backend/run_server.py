from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    os.environ.setdefault("MODELSCOPE_CACHE", str(base_dir / ".modelscope"))
    os.environ.setdefault("FUNASR_MODEL", "paraformer-zh-streaming")
    os.environ.setdefault("FUNASR_MODEL_REVISION", "v2.0.4")

    log_path = base_dir.parent / "data" / "logs" / "funasr.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file
    uvicorn.run("app:app", host="127.0.0.1", port=8002, reload=False)


if __name__ == "__main__":
    main()

