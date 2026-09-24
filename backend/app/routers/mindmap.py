"""思维导图大纲接口。

前端拿到 Markdown 后用 markmap 渲染。默认走本地规则化大纲；
配置了 LLM 时可以用 `prefer=llm` 让模型直接输出 Markdown 大纲。
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..models import Session, utcnow
from ..schemas import MindMapOutlineRead
from ..services.llm import generate_outline_markdown, load_llm_settings
from ..services.outline import build_outline_markdown, build_outline_prompt
from .analyze import load_highlights, load_segments, load_stored_points

logger = logging.getLogger("classroom-listener.mindmap")

router = APIRouter(tags=["mindmap"])

PreferSource = Literal["auto", "local", "llm"]


def _get_session_or_404(db: DbSession, session_id: str) -> Session:
    session = db.get(Session, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="听课会话不存在")
    return session


@router.get("/api/sessions/{session_id}/mindmap", response_model=MindMapOutlineRead)
def get_mindmap_outline(
    session_id: str,
    prefer: PreferSource = Query(default="auto"),
    db: DbSession = Depends(get_db),
) -> MindMapOutlineRead:
    session = _get_session_or_404(db, session_id)

    highlights = load_highlights(db, session_id)
    segments = load_segments(db, session_id)
    stored_points = load_stored_points(db, session_id)
    # 有结构化重点就按「重点/难点/例子/作业/考试提示」成节，没有就退回规则化大纲。
    points = [
        (row.category, row.content, float(row.start_seconds or 0.0))
        for row in stored_points
    ]

    markdown = build_outline_markdown(session, highlights, segments, points or None)
    source: Literal["local", "llm"] = "local"
    warning: str | None = None

    settings = load_llm_settings()
    if prefer == "local":
        warning = None
    elif not settings.configured:
        warning = (
            "未配置 LLM（设置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 后可用模型生成大纲），"
            "当前展示本地规则化大纲。"
        )
    else:
        prompt = build_outline_prompt(session, highlights, segments)
        llm_markdown, error = generate_outline_markdown(prompt, settings=settings)
        if llm_markdown:
            markdown = llm_markdown
            source = "llm"
        else:
            logger.warning("LLM outline failed for session=%s: %s", session_id, error)
            warning = f"模型生成失败，已回退到本地大纲：{error}"

    return MindMapOutlineRead(
        session_id=session_id,
        markdown=markdown,
        source=source,
        llm_configured=settings.configured,
        warning=warning,
        generated_at=utcnow(),
        segment_count=len(segments),
        highlight_count=len(highlights),
    )
