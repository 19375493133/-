from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import GlossaryEntry
from ..schemas import GlossaryEntryCreate, GlossaryEntryRead

router = APIRouter(prefix="/api/glossary", tags=["glossary"])


@router.get("", response_model=list[GlossaryEntryRead])
def list_glossary(db: DbSession = Depends(get_db)) -> list[GlossaryEntry]:
    return list(db.scalars(select(GlossaryEntry).order_by(GlossaryEntry.category, GlossaryEntry.term)).all())


@router.post("", response_model=GlossaryEntryRead, status_code=status.HTTP_201_CREATED)
def create_glossary_entry(
    payload: GlossaryEntryCreate,
    db: DbSession = Depends(get_db),
) -> GlossaryEntry:
    existing = db.scalar(
        select(GlossaryEntry).where(
            GlossaryEntry.term == payload.term,
            GlossaryEntry.category == payload.category,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该词库条目已存在")

    entry = GlossaryEntry(
        term=payload.term,
        category=payload.category,
        replacement=payload.replacement.strip(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_glossary_entry(entry_id: str, db: DbSession = Depends(get_db)) -> Response:
    entry = db.get(GlossaryEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="词库条目不存在")
    db.delete(entry)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

