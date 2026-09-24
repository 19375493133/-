from __future__ import annotations

import base64
import io
import math
import wave

from fastapi.testclient import TestClient


def test_upload_chunk_via_base64(client: TestClient, created_session: dict) -> None:
    """微信小程序云托管只能发 JSON，这条通道用 base64 上传分片。"""
    session_id = created_session["id"]
    payload = {
        "chunk_id": "mp-chunk-1",
        "chunk_index": 0,
        "start_offset_seconds": 0,
        "end_offset_seconds": 12,
        "content_type": "audio/wav",
        "data_base64": base64.b64encode(b"RIFFfake-wav-bytes").decode(),
    }
    response = client.post(f"/api/sessions/{session_id}/chunks/base64", json=payload)
    assert response.status_code == 201, response.text
    chunk = response.json()["chunk"]
    assert chunk["chunk_index"] == 0
    assert chunk["size_bytes"] == len(b"RIFFfake-wav-bytes")

    # 同一个 chunk_id 再传一次是幂等的，不会重复入库
    again = client.post(f"/api/sessions/{session_id}/chunks/base64", json=payload)
    assert again.status_code == 201
    assert again.json()["duplicate"] is True


def test_upload_chunk_base64_rejects_bad_payload(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    response = client.post(
        f"/api/sessions/{session_id}/chunks/base64",
        json={"chunk_id": "bad", "chunk_index": 0, "data_base64": "not-base64!!!"},
    )
    assert response.status_code == 400


def make_wav(frequency: int = 440, seconds: float = 0.1) -> bytes:
    sample_rate = 16000
    frame_count = int(sample_rate * seconds)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            value = int(12000 * math.sin(2 * math.pi * frequency * index / sample_rate))
            frames.extend(value.to_bytes(2, byteorder="little", signed=True))
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


def upload_chunk(
    client: TestClient,
    session_id: str,
    *,
    chunk_id: str,
    chunk_index: int,
    start: float,
    end: float,
) -> None:
    response = client.post(
        f"/api/sessions/{session_id}/chunks",
        data={
            "chunk_id": chunk_id,
            "chunk_index": str(chunk_index),
            "start_offset_seconds": str(start),
            "end_offset_seconds": str(end),
        },
        files={"file": ("chunk.wav", make_wav(), "audio/wav")},
    )
    assert response.status_code == 201, response.text


def test_chunk_upload_is_idempotent(client: TestClient, created_session: dict) -> None:
    session_id = created_session["id"]
    upload_chunk(
        client,
        session_id,
        chunk_id="11111111-1111-1111-1111-111111111111",
        chunk_index=0,
        start=0,
        end=0.1,
    )
    duplicate = client.post(
        f"/api/sessions/{session_id}/chunks",
        data={
            "chunk_id": "11111111-1111-1111-1111-111111111111",
            "chunk_index": "0",
            "start_offset_seconds": "0",
            "end_offset_seconds": "0.1",
        },
        files={"file": ("chunk.wav", make_wav(), "audio/wav")},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["duplicate"] is True

    status = client.get(f"/api/sessions/{session_id}/status")
    assert status.json()["status"] == "recording"


def test_finalize_without_chunks_fails(client: TestClient, created_session: dict) -> None:
    response = client.post(f"/api/sessions/{created_session['id']}/finalize")
    assert response.status_code == 400
    assert "没有可合并" in response.json()["detail"]


def test_finalize_merges_wav_chunks(client: TestClient, created_session: dict) -> None:
    from app.services.audio import find_ffmpeg

    if find_ffmpeg() is None:
        return

    session_id = created_session["id"]
    upload_chunk(
        client,
        session_id,
        chunk_id="22222222-2222-2222-2222-222222222222",
        chunk_index=0,
        start=0,
        end=0.1,
    )
    upload_chunk(
        client,
        session_id,
        chunk_id="33333333-3333-3333-3333-333333333333",
        chunk_index=1,
        start=0.1,
        end=0.2,
    )

    response = client.post(f"/api/sessions/{session_id}/finalize")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "done"
    assert body["duration"] == 0

    status = client.get(f"/api/sessions/{session_id}/status").json()
    assert status["status"] == "done"

    audio = client.get(body["merged_audio_url"])
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"


def test_finalize_realtime_unavailable_marks_pending_batch(
    client: TestClient,
    created_session: dict,
) -> None:
    from app.services.audio import find_ffmpeg

    if find_ffmpeg() is None:
        return

    session_id = created_session["id"]
    upload_chunk(
        client,
        session_id,
        chunk_id="44444444-4444-4444-4444-444444444444",
        chunk_index=0,
        start=0,
        end=0.1,
    )

    response = client.post(
        f"/api/sessions/{session_id}/finalize",
        json={"realtime_transcribe_enabled": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending_batch_transcribe"
