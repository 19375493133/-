from __future__ import annotations

import sys
from pathlib import Path

import uvicorn


def main() -> None:
    log_path = Path(__file__).resolve().parent.parent / "data" / "logs" / "backend.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8", buffering=1)
    sys.stdout = log_file
    sys.stderr = log_file
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()

