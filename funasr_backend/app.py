from __future__ import annotations

import asyncio
import base64
import logging
import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sentence_buffer import SentenceBuffer, diff_increment

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("funasr-backend")

os.environ.setdefault("MODELSCOPE_CACHE", str((__import__("pathlib").Path(__file__).parent / ".modelscope").resolve()))

FUNASR_MODEL = os.getenv("FUNASR_MODEL", "paraformer-zh-streaming")
FUNASR_MODEL_REVISION = os.getenv("FUNASR_MODEL_REVISION", "v2.0.4")
SAMPLE_RATE = 16000
CHUNK_SIZE = [0, 10, 5]  # 600ms
ENCODER_CHUNK_LOOK_BACK = 4
DECODER_CHUNK_LOOK_BACK = 1
CHUNK_STRIDE = CHUNK_SIZE[1] * 960

_model: Any | None = None
_model_lock = threading.Lock()


def get_model() -> Any:
    global _model
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        from funasr import AutoModel

        logger.info(
            "Loading FunASR model=%s revision=%s",
            FUNASR_MODEL,
            FUNASR_MODEL_REVISION,
        )
        _model = AutoModel(
            model=FUNASR_MODEL,
            model_revision=FUNASR_MODEL_REVISION,
            disable_update=True,
        )
        logger.info("FunASR model loaded")
        return _model


def pcm16_to_float32(payload: bytes) -> np.ndarray:
    if not payload:
        return np.zeros(0, dtype=np.float32)
    samples = np.frombuffer(payload, dtype=np.int16).astype(np.float32)
    return samples / 32768.0


def run_model_chunk(
    model: Any,
    samples: np.ndarray,
    cache: dict[str, Any],
    *,
    is_final: bool,
) -> str:
    result = model.generate(
        input=samples,
        cache=cache,
        is_final=is_final,
        chunk_size=CHUNK_SIZE,
        encoder_chunk_look_back=ENCODER_CHUNK_LOOK_BACK,
        decoder_chunk_look_back=DECODER_CHUNK_LOOK_BACK,
    )
    if not result:
        return ""
    return str(result[0].get("text") or "").strip()


app = FastAPI(
    title="Classroom FunASR Paraformer Backend",
    version="0.1.0",
    description="FunASR Paraformer streaming Mandarin ASR service.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    threading.Thread(target=get_model, daemon=True).start()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model": FUNASR_MODEL,
        "revision": FUNASR_MODEL_REVISION,
        "loaded": _model is not None,
    }


@app.websocket("/ws/sessions/{session_id}/live-transcribe")
async def live_transcribe(
    websocket: WebSocket,
    session_id: str,
    language: str = "zh",
) -> None:
    await websocket.accept()
    await websocket.send_json(
        {"type": "ready", "provider": "funasr", "language": language}
    )

    try:
        model = await asyncio.to_thread(get_model)
    except Exception as exc:  # noqa: BLE001
        logger.exception("FunASR model load failed")
        await websocket.send_json(
            {"type": "error", "message": f"FunASR 模型加载失败：{exc}"}
        )
        return

    cache: dict[str, Any] = {}
    pending = np.zeros(0, dtype=np.float32)
    processed_samples = 0
    emitted_text = ""
    sentence = SentenceBuffer()

    async def send_interim(text: str, start_ms: int, end_ms: int) -> None:
        if not text:
            return
        await websocket.send_json(
            {
                "type": "interim",
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "speaker": None,
                "is_mock": False,
            }
        )

    async def send_final(text: str, start_ms: int, end_ms: int) -> None:
        if not text:
            return
        await websocket.send_json(
            {
                "type": "final",
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "speaker": None,
                "is_mock": False,
            }
        )

    async def flush_sentence() -> None:
        flushed = sentence.flush()
        if flushed is None:
            return
        text, start_ms, end_ms = flushed
        await send_final(text, start_ms, end_ms)

    async def handle_model_text(text: str, start_ms: int, end_ms: int) -> None:
        """模型返回累计文本，这里求增量后并入当前句子。"""
        nonlocal emitted_text
        new_text = diff_increment(emitted_text, text)
        emitted_text = text.strip()
        if not new_text:
            return
        sentence.append(new_text, start_ms, end_ms)
        # interim 显示“本句到目前为止”的完整内容，final 才落库。
        await send_interim(sentence.text, sentence.start_ms, sentence.end_ms)
        if sentence.should_flush():
            await flush_sentence()

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "end":
                if pending.size > 0:
                    text = await asyncio.to_thread(
                        run_model_chunk, model, pending, cache, is_final=True
                    )
                    end_ms = int(processed_samples / SAMPLE_RATE * 1000)
                    await handle_model_text(
                        text,
                        max(0, end_ms - int(pending.size / SAMPLE_RATE * 1000)),
                        end_ms,
                    )
                await flush_sentence()
                break

            if message_type != "audio":
                await websocket.send_json(
                    {"type": "error", "message": f"不支持的消息类型：{message_type}"}
                )
                continue

            try:
                payload = base64.b64decode(str(message.get("data") or ""))
            except (ValueError, TypeError):
                await websocket.send_json({"type": "error", "message": "音频帧解码失败"})
                continue

            samples = pcm16_to_float32(payload)
            if samples.size == 0:
                continue
            pending = np.concatenate([pending, samples])

            while pending.size >= CHUNK_STRIDE:
                chunk = pending[:CHUNK_STRIDE]
                pending = pending[CHUNK_STRIDE:]
                text = await asyncio.to_thread(
                    run_model_chunk, model, chunk, cache, is_final=False
                )
                start_ms = int(processed_samples / SAMPLE_RATE * 1000)
                processed_samples += chunk.size
                end_ms = int(processed_samples / SAMPLE_RATE * 1000)
                await handle_model_text(text, start_ms, end_ms)
    except WebSocketDisconnect:
        logger.info("FunASR live transcribe disconnected: session=%s", session_id)
