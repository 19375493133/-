from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import settings
from ..database import get_db
from ..models import RecordingChunk, Session, TranscriptionSegment
from ..schemas import FinalizeRequest
from ..services.audio import AudioMergeError, FFmpegNotFoundError, merge_chunks_to_wav

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["finalize"])


@router.post("/finalize")
def finalize_session(
    session_id: str,
    payload: FinalizeRequest | None = Body(default=None),
    db: DbSession = Depends(get_db),
) -> dict:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")

    chunks = list(
        db.scalars(
            select(RecordingChunk)
            .where(RecordingChunk.session_id == session_id)
            .order_by(RecordingChunk.chunk_index)
        ).all()
    )

    if not chunks:
        session.status = "failed"
        session.error_message = "没有可合并的音频分片。"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=session.error_message)

    for expected, chunk in enumerate(chunks):
        if chunk.chunk_index != expected:
            session.status = "failed"
            session.error_message = (
                f"分片不连续：期望 chunk_index={expected}，实际为 {chunk.chunk_index}。"
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=session.error_message)

    if session.status != "done":
        session.status = "uploading"
        session.error_message = None
        db.commit()

    output_path = settings.data_dir / "sessions" / session_id / "audio" / "recording.wav"
    chunk_paths = [Path(chunk.file_path) for chunk in chunks if Path(chunk.file_path).is_file()]
    if len(chunk_paths) != len(chunks):
        session.status = "failed"
        session.error_message = "存在分片记录，但本地文件已丢失。"
        db.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=session.error_message)

    try:
        merge_chunks_to_wav(chunk_paths, output_path)
    except FFmpegNotFoundError as exc:
        session.status = "failed"
        session.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AudioMergeError as exc:
        session.status = "failed"
        session.error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    realtime_segments = db.scalar(
        select(TranscriptionSegment.id)
        .where(
            TranscriptionSegment.session_id == session_id,
            TranscriptionSegment.source == "realtime",
            TranscriptionSegment.status == "final",
        )
        .limit(1)
    )
    realtime_enabled = bool(payload and payload.realtime_transcribe_enabled)
    if realtime_enabled:
        session.realtime_transcribe_enabled = True

    session.merged_audio_path = str(output_path)
    session.duration = max((int(round(chunk.end_offset_seconds)) for chunk in chunks), default=0)
    session.status = (
        "pending_batch_transcribe"
        if realtime_enabled and realtime_segments is None
        else "done"
    )
    session.error_message = None
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.id,
        "status": session.status,
        "merged_audio_url": f"/api/sessions/{session_id}/audio",
        "duration": session.duration,
    }
