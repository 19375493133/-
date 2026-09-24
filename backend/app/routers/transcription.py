from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import Session, TranscriptionSegment
from ..schemas import (
    TranscriptSegmentCreate,
    TranscriptSegmentRead,
    TranscriptSegmentUpdate,
)

router = APIRouter(tags=["transcription"])


def _get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


@router.get(
    "/api/sessions/{session_id}/transcript",
    response_model=list[TranscriptSegmentRead],
)
def list_transcript(
    session_id: str,
    source: str | None = Query(default=None),
    db: DbSession = Depends(get_db),
) -> list[TranscriptionSegment]:
    _get_session_or_404(db, session_id)
    statement = (
        select(TranscriptionSegment)
        .where(TranscriptionSegment.session_id == session_id)
        .order_by(TranscriptionSegment.start_seconds, TranscriptionSegment.created_at)
    )
    if source:
        statement = statement.where(TranscriptionSegment.source == source)
    return list(db.scalars(statement).all())


@router.post(
    "/api/sessions/{session_id}/transcript",
    response_model=TranscriptSegmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_final_segment(
    session_id: str,
    payload: TranscriptSegmentCreate,
    db: DbSession = Depends(get_db),
) -> TranscriptionSegment:
    _get_session_or_404(db, session_id)
    if payload.status != "final":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="只有 final 字幕会落库，interim 只在前端内存显示",
        )
    segment = TranscriptionSegment(
        session_id=session_id,
        text=payload.text,
        start_seconds=payload.start_seconds,
        end_seconds=payload.end_seconds,
        speaker=payload.speaker,
        source=payload.source,
        status="final",
        edited=False,
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


@router.patch(
    "/api/transcript/segments/{segment_id}",
    response_model=TranscriptSegmentRead,
)
def update_transcript_segment(
    segment_id: str,
    payload: TranscriptSegmentUpdate,
    db: DbSession = Depends(get_db),
) -> TranscriptionSegment:
    segment = db.get(TranscriptionSegment, segment_id)
    if segment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="转写片段不存在")

    updates = payload.model_dump(exclude_unset=True)
    if "text" in updates and updates["text"] is not None:
        segment.text = updates["text"]
    if "speaker" in updates:
        speaker = updates["speaker"]
        segment.speaker = speaker.strip() if isinstance(speaker, str) and speaker.strip() else None
    segment.edited = True
    segment.status = "final"
    db.commit()
    db.refresh(segment)
    return segment
