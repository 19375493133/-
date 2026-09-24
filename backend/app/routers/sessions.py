from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import settings
from ..database import get_db
from ..models import Session
from ..schemas import (
    SessionCreate,
    SessionRead,
    SessionStatusRead,
    SessionUpdate,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _audio_url(session_id: str) -> str:
    return f"/api/sessions/{session_id}/audio"


def get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


def _to_read(session: Session) -> SessionRead:
    data = SessionRead.model_validate(session)
    data.merged_audio_url = _audio_url(session.id) if session.merged_audio_path else None
    return data


@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: DbSession = Depends(get_db)) -> SessionRead:
    session = Session(
        title=payload.title,
        course=payload.course,
        teacher=payload.teacher,
        date=payload.date,
        status="created",
        duration=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _to_read(session)


@router.get("", response_model=list[SessionRead])
def list_sessions(db: DbSession = Depends(get_db)) -> list[SessionRead]:
    sessions = db.scalars(select(Session).order_by(Session.created_at.desc())).all()
    return [_to_read(session) for session in sessions]


@router.get("/{session_id}", response_model=SessionRead)
def get_session(session_id: str, db: DbSession = Depends(get_db)) -> SessionRead:
    return _to_read(get_session_or_404(db, session_id))


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(
    session_id: str,
    payload: SessionUpdate,
    db: DbSession = Depends(get_db),
) -> SessionRead:
    session = get_session_or_404(db, session_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if value is not None:
            setattr(session, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(session)
    return _to_read(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, db: DbSession = Depends(get_db)) -> Response:
    session = get_session_or_404(db, session_id)
    db.delete(session)
    db.commit()

    session_dir = (settings.data_dir / "sessions" / session_id).resolve()
    data_root = settings.data_dir.resolve()
    try:
        if session_dir.is_relative_to(data_root):
            shutil.rmtree(session_dir, ignore_errors=True)
    except OSError:
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{session_id}/status", response_model=SessionStatusRead)
def session_status(session_id: str, db: DbSession = Depends(get_db)) -> SessionStatusRead:
    session = get_session_or_404(db, session_id)
    return SessionStatusRead(
        session_id=session.id,
        status=session.status,  # type: ignore[arg-type]
        duration=session.duration,
        error_message=session.error_message,
        merged_audio_url=_audio_url(session.id) if session.merged_audio_path else None,
    )


@router.get("/{session_id}/audio")
def get_merged_audio(session_id: str, db: DbSession = Depends(get_db)) -> FileResponse:
    session = get_session_or_404(db, session_id)
    if not session.merged_audio_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="该会话还没有合并后的音频")

    audio_path = Path(session.merged_audio_path)
    if not audio_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="音频文件不存在")

    return FileResponse(
        path=audio_path,
        media_type="audio/wav",
        filename=f"{session.title or 'recording'}.wav",
    )

