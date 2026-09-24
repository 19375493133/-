from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    course: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    teacher: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    date: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="created", nullable=False, index=True)
    duration: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    merged_audio_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    realtime_transcribe_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    chunks: Mapped[list[RecordingChunk]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="RecordingChunk.chunk_index"
    )
    highlights: Mapped[list[Highlight]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="Highlight.timestamp_seconds"
    )
    transcription_segments: Mapped[list[TranscriptionSegment]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="TranscriptionSegment.start_seconds",
    )


class RecordingChunk(Base):
    __tablename__ = "recording_chunks"
    __table_args__ = (
        UniqueConstraint("session_id", "chunk_index", name="uq_session_chunk_index"),
        UniqueConstraint("session_id", "chunk_id", name="uq_session_chunk_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    chunk_id: Mapped[str] = mapped_column(String(36), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    start_offset_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    end_offset_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[Session] = relationship(back_populates="chunks")


class Highlight(Base):
    __tablename__ = "highlights"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    speaker: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[Session] = relationship(back_populates="highlights")


class TranscriptionSegment(Base):
    """为后续转写预留：每个转写片段都包含说话人、起止时间和文本。"""

    __tablename__ = "transcription_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    speaker: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="realtime", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="final", nullable=False)
    edited: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[Session] = relationship(back_populates="transcription_segments")


class AnalysisResult(Base):
    """为后续 LLM 分析预留。"""

    __tablename__ = "analysis_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class MindMapNode(Base):
    """为后续思维导图预留。"""

    __tablename__ = "mind_map_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("mind_map_nodes.id"), nullable=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class GlossaryEntry(Base):
    """个性化词库：课程术语、人名、缩写。"""

    __tablename__ = "glossary_entries"
    __table_args__ = (UniqueConstraint("term", "category", name="uq_glossary_term_category"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    term: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    replacement: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
