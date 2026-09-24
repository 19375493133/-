from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import Highlight, Session
from ..schemas import HighlightCreate, HighlightRead

router = APIRouter(prefix="/api/sessions/{session_id}/highlights", tags=["highlights"])


def _get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


@router.get("", response_model=list[HighlightRead])
def list_highlights(session_id: str, db: DbSession = Depends(get_db)) -> list[Highlight]:
    _get_session_or_404(db, session_id)
    return list(
        db.scalars(
            select(Highlight)
            .where(Highlight.session_id == session_id)
            .order_by(Highlight.timestamp_seconds, Highlight.created_at)
        ).all()
    )


@router.post("", response_model=HighlightRead, status_code=status.HTTP_201_CREATED)
def create_highlight(
    session_id: str,
    payload: HighlightCreate,
    db: DbSession = Depends(get_db),
) -> Highlight:
    _get_session_or_404(db, session_id)
    highlight = Highlight(
        session_id=session_id,
        type=payload.type,
        content=payload.content,
        timestamp_seconds=payload.timestamp_seconds,
        speaker=payload.speaker,
    )
    db.add(highlight)
    db.commit()
    db.refresh(highlight)
    return highlight

