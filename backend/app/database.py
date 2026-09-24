from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_sqlite()


def _column_names(connection, table_name: str) -> set[str]:
    rows = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
    return {row[1] for row in rows}


def _migrate_sqlite() -> None:
    """轻量迁移：SQLite 已存在时，create_all 不会补新增列。"""
    if not settings.database_url.startswith("sqlite"):
        return

    with engine.begin() as connection:
        session_columns = _column_names(connection, "sessions")
        if "realtime_transcribe_enabled" not in session_columns:
            connection.execute(
                text(
                    "ALTER TABLE sessions "
                    "ADD COLUMN realtime_transcribe_enabled BOOLEAN NOT NULL DEFAULT 0"
                )
            )

        transcript_columns = _column_names(connection, "transcription_segments")
        if "source" not in transcript_columns:
            connection.execute(
                text(
                    "ALTER TABLE transcription_segments "
                    "ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'realtime'"
                )
            )
        if "status" not in transcript_columns:
            connection.execute(
                text(
                    "ALTER TABLE transcription_segments "
                    "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'final'"
                )
            )
        if "edited" not in transcript_columns:
            connection.execute(
                text(
                    "ALTER TABLE transcription_segments "
                    "ADD COLUMN edited BOOLEAN NOT NULL DEFAULT 0"
                )
            )
