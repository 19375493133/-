"""重点提取接口：先出结构化要点，再由 /mindmap 拼成 Markdown 交给 markmap 出图。"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import AnalysisResult, Highlight, Session, TranscriptionSegment, utcnow
from ..schemas import AnalysisPointRead, AnalysisResponse
from ..services.analysis import extract_llm_points, extract_local_points
from ..services.llm import load_llm_settings

logger = logging.getLogger("classroom-listener.analyze")

router = APIRouter(tags=["analysis"])

PreferSource = Literal["auto", "local", "llm"]


def _get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


def load_highlights(db: DbSession, session_id: str) -> list[Highlight]:
    return list(
        db.scalars(
            select(Highlight)
            .where(Highlight.session_id == session_id)
            .order_by(Highlight.timestamp_seconds, Highlight.created_at)
        ).all()
    )


def load_segments(db: DbSession, session_id: str) -> list[TranscriptionSegment]:
    return list(
        db.scalars(
            select(TranscriptionSegment)
            .where(TranscriptionSegment.session_id == session_id)
            .order_by(TranscriptionSegment.start_seconds, TranscriptionSegment.created_at)
        ).all()
    )


def load_stored_points(db: DbSession, session_id: str) -> list[AnalysisResult]:
    return list(
        db.scalars(
            select(AnalysisResult)
            .where(AnalysisResult.session_id == session_id)
            .order_by(AnalysisResult.start_seconds, AnalysisResult.created_at)
        ).all()
    )


@router.post("/api/sessions/{session_id}/analyze", response_model=AnalysisResponse)
def analyze_session(
    session_id: str,
    prefer: PreferSource = Query(default="auto"),
    db: DbSession = Depends(get_db),
) -> AnalysisResponse:
    """提取重点。

    - `prefer=local`：只用规则（不调用模型）
    - `prefer=llm`：让模型输出结构化要点，失败自动回退并在 warning 里说明
    - `prefer=auto`：配置了 LLM 就用模型，没有就用规则
    """
    session = _get_session_or_404(db, session_id)
    highlights = load_highlights(db, session_id)
    segments = load_segments(db, session_id)

    settings = load_llm_settings()
    source: Literal["local", "llm"] = "local"
    warning: str | None = None
    points = None

    if prefer == "local":
        points = extract_local_points(session, highlights, segments)
    elif not settings.configured:
        points = extract_local_points(session, highlights, segments)
        warning = (
            "未配置 LLM（设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 后可用模型提取重点），"
            "当前使用本地规则提取。"
        )
    else:
        llm_points, error = extract_llm_points(
            session, highlights, segments, settings=settings
        )
        if llm_points:
            points = llm_points
            source = "llm"
        else:
            logger.warning("LLM analysis failed for session=%s: %s", session_id, error)
            points = extract_local_points(session, highlights, segments)
            warning = f"模型提取失败，已回退到本地规则：{error}"

    db.execute(delete(AnalysisResult).where(AnalysisResult.session_id == session_id))
    for point in points:
        db.add(
            AnalysisResult(
                session_id=session_id,
                category=point.category,
                content=point.text,
                start_seconds=point.start_seconds,
                end_seconds=None,
            )
        )
    db.commit()

    counts: dict[str, int] = {}
    for point in points:
        counts[point.category] = counts.get(point.category, 0) + 1

    return AnalysisResponse(
        session_id=session_id,
        source=source,
        llm_configured=settings.configured,
        warning=warning,
        points=[
            AnalysisPointRead(
                category=point.category,
                text=point.text,
                start_seconds=point.start_seconds,
                source=source if point.source == "llm" else "local",
            )
            for point in points
        ],
        counts=counts,
        generated_at=utcnow(),
        segment_count=len(segments),
        highlight_count=len(highlights),
    )


@router.get("/api/sessions/{session_id}/analysis", response_model=list[AnalysisPointRead])
def list_analysis(
    session_id: str, db: DbSession = Depends(get_db)
) -> list[AnalysisPointRead]:
    """读取已保存的重点（页面刷新后仍然在）。"""
    _get_session_or_404(db, session_id)
    stored = load_stored_points(db, session_id)
    return [
        AnalysisPointRead(
            category=row.category,  # type: ignore[arg-type]
            text=row.content,
            start_seconds=float(row.start_seconds or 0.0),
            source="local",
        )
        for row in stored
        if row.category in {
            "key_point",
            "difficult",
            "example",
            "homework",
            "exam",
            "term",
        }
    ]
