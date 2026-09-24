from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_and_list_session(client: TestClient) -> None:
    created = client.post(
        "/api/sessions",
        json={"title": "线性代数", "course": "数学", "teacher": "李老师", "date": "2026-09-17"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "created"
    assert body["duration"] == 0

    listed = client.get("/api/sessions")
    assert listed.status_code == 200
    assert any(item["id"] == body["id"] for item in listed.json())


def test_get_update_delete_session(client: TestClient, created_session: dict) -> None:
    session_id = created_session["id"]

    fetched = client.get(f"/api/sessions/{session_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "高等数学：极限"

    updated = client.patch(f"/api/sessions/{session_id}", json={"teacher": "王老师"})
    assert updated.status_code == 200
    assert updated.json()["teacher"] == "王老师"

    deleted = client.delete(f"/api/sessions/{session_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/sessions/{session_id}").status_code == 404


def test_status_returns_created(client: TestClient, created_session: dict) -> None:
    response = client.get(f"/api/sessions/{created_session['id']}/status")
    assert response.status_code == 200
    assert response.json()["status"] == "created"

