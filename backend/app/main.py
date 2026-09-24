from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import create_all
from .routers import (
    analyze,
    chunks,
    finalize,
    future,
    glossary,
    highlights,
    live_transcribe,
    mindmap,
    sessions,
    transcription,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("classroom-listener")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_all()
    logger.info("Database initialized at %s", settings.database_url)
    logger.info("Data directory: %s", settings.data_dir)
    yield


app = FastAPI(
    title="大学课堂听课助手 API",
    version="0.1.0",
    description="第一阶段：会话、录音分片、合并与课堂标记。",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(chunks.router)
app.include_router(finalize.router)
app.include_router(highlights.router)
app.include_router(glossary.router)
app.include_router(transcription.router)
app.include_router(live_transcribe.router)
app.include_router(mindmap.router)
app.include_router(analyze.router)
app.include_router(future.router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "classroom-listener-backend"}
