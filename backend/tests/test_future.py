from __future__ import annotations

from fastapi.testclient import TestClient


def test_future_endpoints_are_not_implemented(client: TestClient, created_session: dict) -> None:
    session_id = created_session["id"]
    for method, path in [
        ("GET", f"/api/sessions/{session_id}/export"),
    ]:
        response = getattr(client, method.lower())(path)
        assert response.status_code == 501, (method, path, response.text)
        assert response.json()["status"] == "not_implemented"


def test_analyze_is_implemented_as_key_points(
    client: TestClient, created_session: dict
) -> None:
    """analyze 已从占位接口升级为「结构化重点提取」。"""
    session_id = created_session["id"]
    response = client.post(f"/api/sessions/{session_id}/analyze?prefer=local")
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "local"
    assert isinstance(data["points"], list)


def test_mindmap_is_implemented_as_markdown_outline(
    client: TestClient, created_session: dict
) -> None:
    """mindmap 已从占位接口升级为「返回 Markdown 大纲」，交给前端 markmap 渲染。"""
    session_id = created_session["id"]
    response = client.get(f"/api/sessions/{session_id}/mindmap")
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "local"
    assert data["markdown"].startswith("#")
