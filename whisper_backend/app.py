from __future__ import annotations

import asyncio
import base64
import logging
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import (
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 优先使用国内可访问的 Hugging Face 镜像；可以通过环境变量覆盖。
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("whisper-backend")

MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
API_KEY = os.getenv("WHISPER_API_KEY", "")
INITIAL_PROMPT = os.getenv(
    "WHISPER_INITIAL_PROMPT",
    "以下是大学课堂普通话讲课内容，请使用简体中文输出。",
)
HOTWORDS = os.getenv(
    "WHISPER_HOTWORDS",
    "函数 极限 自变量 趋近 定义域 导数 积分 定理 证明",
)
MAX_UPLOAD_BYTES = int(os.getenv("WHISPER_MAX_UPLOAD_MB", "120")) * 1024 * 1024

_model: Any | None = None
_model_lock = threading.Lock()


class TranscriptSegment(BaseModel):
    text: str
    start: float
    end: float


class TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = None
    segments: list[TranscriptSegment]


def get_model() -> Any:
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper 未安装。请执行 pip install -r whisper_backend/requirements.txt"
            ) from exc

        logger.info(
            "Loading faster-whisper model=%s device=%s compute_type=%s",
            MODEL_NAME,
            DEVICE,
            COMPUTE_TYPE,
        )
        _model = WhisperModel(
            MODEL_NAME,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
        )
        logger.info("faster-whisper model loaded")
        return _model


def _transcribe_sync(
    audio_path: Path,
    language: str | None,
    initial_prompt: str | None = INITIAL_PROMPT,
) -> TranscriptionResponse:
    model = get_model()
    segments_iterator, info = model.transcribe(
        str(audio_path),
        language=language or None,
        vad_filter=True,
        beam_size=5,
        condition_on_previous_text=False,
        initial_prompt=initial_prompt or None,
        hotwords=HOTWORDS or None,
    )
    segments: list[TranscriptSegment] = []
    texts: list[str] = []
    for segment in segments_iterator:
        # 提示词（initial_prompt）有时会被模型复读进正文，这里统一清洗掉。
        text = _clean_stream_text(segment.text)
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                text=text,
                start=float(segment.start),
                end=float(segment.end),
            )
        )
        texts.append(text)
    return TranscriptionResponse(
        text="".join(texts),
        language=getattr(info, "language", language),
        duration=getattr(info, "duration", None),
        segments=segments,
    )


def _transcribe_bytes_sync(
    content: bytes,
    language: str | None,
    initial_prompt: str | None = None,
) -> TranscriptionResponse:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
        temp_file.write(content)
        temp_path = Path(temp_file.name)
    try:
        return _transcribe_sync(temp_path, language, initial_prompt)
    finally:
        temp_path.unlink(missing_ok=True)


def _clean_stream_text(text: str) -> str:
    cleaned = text
    for noise in (
        "以下是大学课堂普通话讲课内容，请使用简体中文输出。",
        "请使用简体中文输出。",
        "请使用简体中文输出",
        "以下是大学课堂普通话讲课内容",
    ):
        cleaned = cleaned.replace(noise, "")
    return cleaned.strip()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 后台预加载，避免第一次请求等待模型下载。
    threading.Thread(target=get_model, daemon=True).start()
    yield


app = FastAPI(
    title="Classroom Whisper Backend",
    version="0.1.0",
    description="免费 faster-whisper 转写服务，接收音频并返回中文转写片段。",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:3000,http://localhost:3000,https://classroom-listener-ai.netlify.app",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "loaded": _model is not None,
    }


@app.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("zh"),
    api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> TranscriptionResponse:
    if API_KEY and api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Whisper API Key 不正确",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传的音频为空")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"音频超过 {MAX_UPLOAD_BYTES // 1024 // 1024}MB 限制",
        )

    suffix = Path(file.filename or "recording.webm").suffix or ".webm"
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = Path(temp_file.name)
        return await asyncio.to_thread(_transcribe_sync, temp_path, language)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"转写失败：{exc}") from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@app.websocket("/ws/sessions/{session_id}/live-transcribe")
async def live_transcribe_websocket(
    websocket: WebSocket,
    session_id: str,
    provider: str = "backend_ws",
    language: str = "zh",
) -> None:
    await websocket.accept()
    await websocket.send_json(
        {"type": "ready", "provider": provider, "language": language}
    )

    first_chunk: bytes | None = None
    first_transcript = ""
    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            if message_type == "end":
                break
            if message_type != "audio_chunk":
                await websocket.send_json(
                    {"type": "error", "message": f"不支持的消息类型：{message_type}"}
                )
                continue

            try:
                chunk = base64.b64decode(str(message.get("data") or ""))
            except (ValueError, TypeError):
                await websocket.send_json({"type": "error", "message": "音频分片解码失败"})
                continue
            if not chunk:
                continue

            is_first = bool(message.get("is_first"))
            if is_first or first_chunk is None:
                first_chunk = chunk
                payload = chunk
            else:
                payload = first_chunk + chunk

            try:
                result = await asyncio.to_thread(
                    _transcribe_bytes_sync,
                    payload,
                    language,
                    "",
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("Streaming transcription failed")
                await websocket.send_json(
                    {"type": "error", "message": f"实时转写失败：{exc}"}
                )
                continue

            full_text = _clean_stream_text(result.text)
            if not full_text:
                continue

            if is_first or not first_transcript:
                first_transcript = full_text
                new_text = full_text
            elif full_text.startswith(first_transcript):
                new_text = full_text[len(first_transcript) :].strip()
            else:
                new_text = full_text

            if not new_text:
                continue

            start_ms = int(message.get("start_ms") or 0)
            end_ms = int(message.get("end_ms") or 0)
            await websocket.send_json(
                {
                    "type": "interim",
                    "text": new_text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "is_mock": False,
                }
            )
            await websocket.send_json(
                {
                    "type": "final",
                    "text": new_text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "speaker": None,
                    "is_mock": False,
                }
            )
    except WebSocketDisconnect:
        logger.info("live transcribe disconnected: session=%s", session_id)
