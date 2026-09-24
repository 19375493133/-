from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import Session
from ..schemas import NotImplementedResponse

router = APIRouter(prefix="/api/sessions/{session_id}", tags=["future"])


def _not_implemented(route: str) -> NotImplementedResponse:
    return NotImplementedResponse(
        status="not_implemented",
        message="该能力将在后续里程碑实现，当前只预留接口，不返回伪造结果。",
        route=route,
    )


def _ensure_session(session_id: str, db: DbSession) -> None:
    if db.get(Session, session_id) is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")


@router.get("/export", response_model=NotImplementedResponse, status_code=501)
def export(session_id: str, db: DbSession = Depends(get_db)) -> NotImplementedResponse:
    _ensure_session(session_id, db)
    return _not_implemented(f"/api/sessions/{session_id}/export")
