from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import settings
from ..database import get_db
from ..models import RecordingChunk, Session
from ..schemas import (
    RecordingChunkBase64Upload,
    RecordingChunkRead,
    RecordingChunkUploadResponse,
)
from ..services.audio import sha256_file

router = APIRouter(prefix="/api/sessions/{session_id}/chunks", tags=["chunks"])


def _extension_for(content_type: str | None) -> str:
    mapping = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".mp4",
        "video/webm": ".webm",
        "video/mp4": ".mp4",
        "audio/wav": ".wav",
        "audio/mpeg": ".mp3",
    }
    return mapping.get((content_type or "audio/webm").split(";")[0].strip().lower(), ".webm")


def _get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


def _chunk_dir(session_id: str) -> Path:
    path = settings.data_dir / "sessions" / session_id / "chunks"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _store_chunk(
    db: DbSession,
    session: Session,
    *,
    session_id: str,
    chunk_id: str,
    chunk_index: int,
    start_offset_seconds: float,
    end_offset_seconds: float,
    content: bytes,
    suffix: str,
) -> RecordingChunkUploadResponse:
    """分片入库的公共逻辑（multipart 与 base64 两条上传通道共用）。"""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", chunk_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chunk_id 只能包含字母、数字、下划线和短横线",
        )

    existing_by_id = db.scalar(
        select(RecordingChunk).where(
            RecordingChunk.session_id == session_id,
            RecordingChunk.chunk_id == chunk_id,
        )
    )
    if existing_by_id is not None:
        return RecordingChunkUploadResponse(
            chunk=RecordingChunkRead.model_validate(existing_by_id),
            duplicate=True,
        )

    if session.status not in ("created", "recording"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"当前状态为 {session.status}，不能继续上传分片",
        )

    same_index = db.scalar(
        select(RecordingChunk).where(
            RecordingChunk.session_id == session_id,
            RecordingChunk.chunk_index == chunk_index,
        )
    )
    if same_index is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"chunk_index={chunk_index} 已存在，且 chunk_id 不匹配",
        )

    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传的音频分片为空")

    chunk_dir = _chunk_dir(session_id)
    file_path = chunk_dir / f"{chunk_index:04d}_{chunk_id}{suffix}"
    with file_path.open("wb") as out_file:
        out_file.write(content)

    try:
        checksum = sha256_file(file_path)
    except OSError as exc:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"保存分片失败：{exc}",
        ) from exc

    chunk = RecordingChunk(
        session_id=session_id,
        chunk_id=chunk_id,
        chunk_index=chunk_index,
        file_path=str(file_path),
        start_offset_seconds=start_offset_seconds,
        end_offset_seconds=end_offset_seconds,
        size_bytes=len(content),
        sha256=checksum,
    )
    db.add(chunk)

    if session.status == "created":
        session.status = "recording"
    session.duration = max(session.duration, int(round(max(end_offset_seconds, 0))))
    db.commit()
    db.refresh(chunk)

    return RecordingChunkUploadResponse(
        chunk=RecordingChunkRead.model_validate(chunk),
        duplicate=False,
    )


@router.get("", response_model=list[RecordingChunkRead])
def list_chunks(session_id: str, db: DbSession = Depends(get_db)) -> list[RecordingChunk]:
    _get_session_or_404(db, session_id)
    return list(
        db.scalars(
            select(RecordingChunk)
            .where(RecordingChunk.session_id == session_id)
            .order_by(RecordingChunk.chunk_index)
        ).all()
    )


@router.post("", response_model=RecordingChunkUploadResponse, status_code=status.HTTP_201_CREATED)
def upload_chunk(
    session_id: str,
    chunk_id: str = Form(..., min_length=1, max_length=64),
    chunk_index: int = Form(..., ge=0),
    start_offset_seconds: float = Form(0.0),
    end_offset_seconds: float = Form(0.0),
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
) -> RecordingChunkUploadResponse:
    session = _get_session_or_404(db, session_id)
    return _store_chunk(
        db,
        session,
        session_id=session_id,
        chunk_id=chunk_id,
        chunk_index=chunk_index,
        start_offset_seconds=start_offset_seconds,
        end_offset_seconds=end_offset_seconds,
        content=file.file.read(),
        suffix=_extension_for(file.content_type),
    )


@router.post(
    "/base64",
    response_model=RecordingChunkUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_chunk_base64(
    session_id: str,
    payload: RecordingChunkBase64Upload,
    db: DbSession = Depends(get_db),
) -> RecordingChunkUploadResponse:
    """微信小程序云托管通道：callContainer 只能发 JSON，所以音频用 base64 塞进来。"""
    session = _get_session_or_404(db, session_id)
    try:
        content = base64.b64decode(payload.data_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="data_base64 不是合法的 base64",
        ) from exc

    return _store_chunk(
        db,
        session,
        session_id=session_id,
        chunk_id=payload.chunk_id,
        chunk_index=payload.chunk_index,
        start_offset_seconds=payload.start_offset_seconds,
        end_offset_seconds=payload.end_offset_seconds,
        content=content,
        suffix=_extension_for(payload.content_type),
    )
