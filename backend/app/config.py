from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# 优先加载仓库根目录的 .env，也兼容 backend/.env。
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "backend" / ".env")


def _resolve_data_dir(value: str | None) -> Path:
    raw = (value or "./data").strip()
    path = Path(raw)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


class Settings:
    def __init__(self) -> None:
        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8000"))
        self.data_dir = _resolve_data_dir(os.getenv("DATA_DIR"))
        self.database_url = self._normalize_database_url(
            os.getenv("DATABASE_URL") or self._default_database_url()
        )
        self.ffmpeg_path = os.getenv("FFMPEG_PATH") or None
        self.frontend_origins = [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://127.0.0.1:3000,http://localhost:3000",
            ).split(",")
            if origin.strip()
        ]

        self.data_dir.mkdir(parents=True, exist_ok=True)

    def _default_database_url(self) -> str:
        # Windows 绝对路径需要正确拼成 sqlite:///C:/... 形式。
        db_path = (self.data_dir / "app.db").resolve().as_posix()
        return f"sqlite:///{db_path}"

    def _normalize_database_url(self, raw: str) -> str:
        prefix = "sqlite:///"
        if not raw.startswith(prefix):
            return raw
        db_path = raw[len(prefix) :]
        if not Path(db_path).is_absolute():
            db_path = (REPO_ROOT / db_path).resolve().as_posix()
        return f"{prefix}{db_path}"


settings = Settings()
