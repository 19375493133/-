from __future__ import annotations

from fastapi.testclient import TestClient

from app.routers import analyze as analyze_router
from app.services.analysis import parse_points_json
from app.services.llm import LLMSettings


def _seed(client: TestClient, session_id: str) -> None:
    client.post(
        f"/api/sessions/{session_id}/highlights",
        json={
            "type": "important",
            "content": "随机事件、必然事件、不可能事件的定义",
            "timestamp_seconds": 45,
            "speaker": "李老师",
        },
    )
    client.post(
        f"/api/sessions/{session_id}/highlights",
        json={
            "type": "difficult",
            "content": "独立性与互不相容容易混淆",
            "timestamp_seconds": 320,
        },
    )
    for text, start, end in (
        ("随机事件的概率定义要记住", 0, 6),
        ("例如抛硬币正面向上的概率是二分之一", 6, 14),
        ("作业是课本第十二页第三题", 62, 70),
        ("下节课讲条件概率，记得预习，考试会考", 70, 78),
    ):
        client.post(
            f"/api/sessions/{session_id}/transcript",
            json={
                "text": text,
                "start_seconds": start,
                "end_seconds": end,
                "source": "realtime",
                "status": "final",
            },
        )


def test_parse_points_json_handles_code_fence_and_bad_items() -> None:
    raw = """```json
    [
      {"category": "key_point", "text": "极限的定义", "start_seconds": 12},
      {"category": "unknown", "text": "会被归到重点", "start_seconds": "abc"},
      {"category": "homework", "text": ""},
      {"category": "homework", "text": "课后第三题"}
    ]
    ```"""
    points = parse_points_json(raw)
    assert points is not None
    categories = [point.category for point in points]
    assert "key_point" in categories
    assert "homework" in categories
    # 没有 text 的条目被丢弃；非法 category 归到 key_point；非法时间戳归 0
    assert all(point.text for point in points)
    assert len(points) == 3


def test_parse_points_json_returns_none_for_garbage() -> None:
    assert parse_points_json("模型今天不想干活") is None


def test_analyze_local_extracts_structured_points(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    _seed(client, session_id)

    data = client.post(f"/api/sessions/{session_id}/analyze?prefer=local").json()
    assert data["source"] == "local"
    assert data["llm_configured"] is False
    assert data["warning"] is None
    assert data["segment_count"] == 4
    assert data["highlight_count"] == 2

    texts = [point["text"] for point in data["points"]]
    assert "随机事件、必然事件、不可能事件的定义" in texts
    assert "独立性与互不相容容易混淆" in texts
    assert any("作业是课本第十二页第三题" in text for text in texts)
    assert any("考试会考" in text for text in texts)
    assert any("例如抛硬币" in text for text in texts)

    categories = {point["category"] for point in data["points"]}
    assert {"key_point", "difficult", "example", "homework"}.issubset(categories)
    assert data["counts"]["key_point"] >= 1


def test_analysis_is_persisted_and_reused_by_mindmap(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    _seed(client, session_id)
    client.post(f"/api/sessions/{session_id}/analyze?prefer=local")

    stored = client.get(f"/api/sessions/{session_id}/analysis").json()
    assert len(stored) > 0
    assert {"category", "text", "start_seconds"} <= set(stored[0])

    markdown = client.get(f"/api/sessions/{session_id}/mindmap").json()["markdown"]
    assert "## 重点（" in markdown
    assert "## 难点" in markdown
    assert "## 作业" in markdown
    assert "## 老师讲解" in markdown


def test_analyze_warns_when_llm_not_configured(
    client: TestClient, created_session: dict
) -> None:
    data = client.post(
        f"/api/sessions/{created_session['id']}/analyze?prefer=llm"
    ).json()
    assert data["source"] == "local"
    assert data["warning"] is not None
    assert "未配置 LLM" in data["warning"]


def test_analyze_uses_llm_points_when_configured(
    client: TestClient, created_session: dict, monkeypatch
) -> None:
    session_id = created_session["id"]
    _seed(client, session_id)

    fake_settings = LLMSettings(
        base_url="http://127.0.0.1:9/v1",
        api_key="test",
        model="fake",
        timeout_seconds=1.0,
    )
    monkeypatch.setattr(analyze_router, "load_llm_settings", lambda: fake_settings)
    monkeypatch.setattr(
        analyze_router,
        "extract_llm_points",
        lambda *args, **kwargs: (
            [
                analyze_router.extract_local_points(*args)[0],
            ],
            None,
        ),
    )

    data = client.post(f"/api/sessions/{session_id}/analyze?prefer=llm").json()
    assert data["source"] == "llm"
    assert data["llm_configured"] is True
    assert data["warning"] is None
    assert len(data["points"]) == 1


def test_analyze_falls_back_when_llm_fails(
    client: TestClient, created_session: dict, monkeypatch
) -> None:
    session_id = created_session["id"]
    _seed(client, session_id)

    fake_settings = LLMSettings(
        base_url="http://127.0.0.1:9/v1",
        api_key="test",
        model="fake",
        timeout_seconds=1.0,
    )
    monkeypatch.setattr(analyze_router, "load_llm_settings", lambda: fake_settings)
    monkeypatch.setattr(
        analyze_router,
        "extract_llm_points",
        lambda *args, **kwargs: (None, "LLM 返回 500"),
    )

    data = client.post(f"/api/sessions/{session_id}/analyze?prefer=llm").json()
    assert data["source"] == "local"
    assert data["warning"] is not None
    assert "回退到本地规则" in data["warning"]
    assert len(data["points"]) > 0
