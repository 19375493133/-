from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_and_list_highlights(client: TestClient, created_session: dict) -> None:
    session_id = created_session["id"]
    payload = {
        "type": "important",
        "content": "极限的定义",
        "timestamp_seconds": 12.5,
        "speaker": "张老师",
    }
    created = client.post(f"/api/sessions/{session_id}/highlights", json=payload)
    assert created.status_code == 201
    assert created.json()["type"] == "important"

    listed = client.get(f"/api/sessions/{session_id}/highlights")
    assert listed.status_code == 200
    assert listed.json()[0]["content"] == "极限的定义"
    assert listed.json()[0]["timestamp_seconds"] == 12.5


def test_note_without_speaker(client: TestClient, created_session: dict) -> None:
    response = client.post(
        f"/api/sessions/{created_session['id']}/highlights",
        json={"type": "note", "content": "随想随记", "timestamp_seconds": 20},
    )
    assert response.status_code == 201
    assert response.json()["speaker"] is None

