from __future__ import annotations

from fastapi.testclient import TestClient


def test_transcript_create_list_and_edit(client: TestClient, created_session: dict) -> None:
    session_id = created_session["id"]

    created = client.post(
        f"/api/sessions/{session_id}/transcript",
        json={
            "text": "极限的定义",
            "start_seconds": 1.5,
            "end_seconds": 3.0,
            "speaker": "老师",
            "source": "realtime",
            "status": "final",
        },
    )
    assert created.status_code == 201, created.text
    segment = created.json()
    assert segment["source"] == "realtime"
    assert segment["status"] == "final"
    assert segment["edited"] is False

    listed = client.get(
        f"/api/sessions/{session_id}/transcript",
        params={"source": "realtime"},
    )
    assert listed.status_code == 200
    assert [item["text"] for item in listed.json()] == ["极限的定义"]

    edited = client.patch(
        f"/api/transcript/segments/{segment['id']}",
        json={"text": "极限的严格定义"},
    )
    assert edited.status_code == 200
    assert edited.json()["text"] == "极限的严格定义"
    assert edited.json()["edited"] is True


def test_interim_segment_is_not_persisted(client: TestClient, created_session: dict) -> None:
    response = client.post(
        f"/api/sessions/{created_session['id']}/transcript",
        json={
            "text": "临时字幕",
            "start_seconds": 0,
            "end_seconds": 1,
            "status": "interim",
        },
    )
    assert response.status_code == 400


def test_websocket_text_event_persists_final_segment(
    client: TestClient,
    created_session: dict,
) -> None:
    session_id = created_session["id"]
    with client.websocket_connect(
        f"/ws/sessions/{session_id}/live-transcribe?provider=webspeech&language=zh"
    ) as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "ready"
        websocket.send_json(
            {
                "type": "text",
                "text": "老师讲的第一句",
                "start_ms": 0,
                "end_ms": 1500,
                "is_final": True,
                "speaker": "老师",
            }
        )
        final = websocket.receive_json()
        assert final["type"] == "final"
        assert final["text"] == "老师讲的第一句"
        assert "id" in final

    listed = client.get(f"/api/sessions/{session_id}/transcript")
    assert listed.status_code == 200
    assert any(item["text"] == "老师讲的第一句" for item in listed.json())


def test_websocket_mock_provider_is_clearly_marked(
    client: TestClient,
    created_session: dict,
) -> None:
    session_id = created_session["id"]
    with client.websocket_connect(
        f"/ws/sessions/{session_id}/live-transcribe?provider=mock"
    ) as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_json(
            {
                "type": "audio",
                "data": "",
                "start_ms": 0,
                "end_ms": 400,
            }
        )
        message = websocket.receive_json()
        assert message["type"] == "interim"
        assert message["is_mock"] is True
        assert message["text"].startswith("[MOCK]")


def test_websocket_backend_provider_reports_unavailable(
    client: TestClient,
    created_session: dict,
) -> None:
    session_id = created_session["id"]
    with client.websocket_connect(
        f"/ws/sessions/{session_id}/live-transcribe?provider=backend_ws"
    ) as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_json({"type": "audio", "data": "", "start_ms": 0, "end_ms": 400})
        message = websocket.receive_json()
        assert message["type"] == "error"
        assert "实时转写不可用" in message["message"]
