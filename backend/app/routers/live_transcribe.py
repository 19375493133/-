from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import SessionLocal
from ..models import Session, TranscriptionSegment

logger = logging.getLogger("classroom-listener.live-transcribe")

router = APIRouter(tags=["live-transcription"])


def _seconds(milliseconds: object) -> float:
    try:
        value = float(milliseconds or 0)
    except (TypeError, ValueError):
        value = 0
    return max(0.0, value / 1000.0)


@router.websocket("/ws/sessions/{session_id}/live-transcribe")
async def live_transcribe(
    websocket: WebSocket,
    session_id: str,
    provider: str = "webspeech",
    language: str = "zh",
) -> None:
    await websocket.accept()

    db = SessionLocal()
    try:
        session = db.get(Session, session_id)
        if session is None:
            await websocket.send_json({"type": "error", "message": "听课会话不存在"})
            await websocket.close(code=4404)
            return

        session.realtime_transcribe_enabled = True
        db.commit()

        await websocket.send_json(
            {
                "type": "ready",
                "provider": provider,
                "language": language,
            }
        )

        backend_provider_unavailable = False
        mock_frame_index = 0

        while True:
            try:
                message = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "消息不是合法 JSON"})
                continue

            message_type = message.get("type")
            if message_type == "end":
                break

            if message_type == "text":
                text = str(message.get("text") or "").strip()
                if not text:
                    continue
                start_ms = message.get("start_ms", 0)
                end_ms = message.get("end_ms", 0)
                is_final = bool(message.get("is_final", True))
                is_mock = bool(message.get("is_mock", False))
                payload = {
                    "type": "final" if is_final else "interim",
                    "text": text,
                    "start_ms": start_ms,
                    "end_ms": end_ms,
                    "speaker": message.get("speaker"),
                }
                if is_mock:
                    payload["is_mock"] = True
                if is_final and not is_mock:
                    segment = TranscriptionSegment(
                        session_id=session_id,
                        text=text,
                        start_seconds=_seconds(start_ms),
                        end_seconds=_seconds(end_ms),
                        speaker=message.get("speaker"),
                        source="realtime",
                        status="final",
                        edited=False,
                    )
                    db.add(segment)
                    db.commit()
                    db.refresh(segment)
                    payload["id"] = segment.id
                await websocket.send_json(payload)
                continue

            if message_type != "audio":
                await websocket.send_json(
                    {"type": "error", "message": f"不支持的实时转写消息类型：{message_type}"}
                )
                continue

            if provider == "webspeech":
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": "BrowserWebSpeechProvider 在浏览器端处理音频，不需要上传音频帧。",
                    }
                )
                continue

            if provider == "mock":
                mock_frame_index += 1
                start_ms = message.get("start_ms", max(0, (mock_frame_index - 1) * 400))
                end_ms = message.get("end_ms", mock_frame_index * 400)
                await websocket.send_json(
                    {
                        "type": "interim",
                        "text": f"[MOCK] 模拟实时字幕片段 {mock_frame_index}",
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "is_mock": True,
                    }
                )
                if mock_frame_index % 4 == 0:
                    await websocket.send_json(
                        {
                            "type": "final",
                            "text": f"[MOCK] 模拟实时字幕片段 {mock_frame_index - 3}-{mock_frame_index}",
                            "start_ms": max(0, (mock_frame_index - 4) * 400),
                            "end_ms": end_ms,
                            "speaker": None,
                            "is_mock": True,
                        }
                    )
                continue

            if provider == "backend_ws":
                if not backend_provider_unavailable:
                    backend_provider_unavailable = True
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "BackendWebSocketASRProvider 尚未配置真实流式 ASR，实时转写不可用。",
                        }
                    )
                continue

            await websocket.send_json(
                {"type": "error", "message": f"未知 Provider：{provider}"}
            )
    except WebSocketDisconnect:
        logger.info("live transcribe disconnected: session=%s", session_id)
    finally:
        db.close()
