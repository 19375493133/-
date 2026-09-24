from __future__ import annotations

from fastapi.testclient import TestClient


def test_glossary_crud(client: TestClient) -> None:
    created = client.post(
        "/api/glossary",
        json={"term": "拉格朗日", "category": "person", "replacement": "Lagrange"},
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    listed = client.get("/api/glossary")
    assert listed.status_code == 200
    assert any(item["term"] == "拉格朗日" for item in listed.json())

    deleted = client.delete(f"/api/glossary/{entry_id}")
    assert deleted.status_code == 204

