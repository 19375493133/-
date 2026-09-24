from __future__ import annotations

from fastapi.testclient import TestClient

from app.routers import mindmap as mindmap_router
from app.services.llm import LLMSettings, clean_markdown, is_usable_outline
from app.services.outline import format_timestamp


def _seed_session(client: TestClient, session_id: str) -> None:
    client.post(
        f"/api/sessions/{session_id}/highlights",
        json={
            "type": "important",
            "content": "极限的定义要记住",
            "timestamp_seconds": 12.5,
            "speaker": "张老师",
        },
    )
    client.post(
        f"/api/sessions/{session_id}/highlights",
        json={
            "type": "difficult",
            "content": "无穷小的比较不好理解",
            "timestamp_seconds": 96.0,
        },
    )
    for text, start, end in (
        ("今天我们讲函数的极限", 0.0, 5.0),
        ("当自变量趋近于无穷大时函数值趋近于常数", 5.4, 10.8),
        ("这个常数就叫做极限，大家课后完成第三题的证明", 10.8, 16.2),
        ("下节课我们讲连续与间断点，记得预习", 16.2, 21.0),
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


def test_format_timestamp() -> None:
    assert format_timestamp(0) == "00:00"
    assert format_timestamp(72.4) == "01:12"
    assert format_timestamp(3725) == "01:02:05"


def test_clean_markdown_strips_code_fence() -> None:
    raw = "```markdown\n# 极限\n\n## 定义\n- 内容\n```"
    cleaned = clean_markdown(raw)
    assert cleaned.startswith("# 极限")
    assert "```" not in cleaned
    assert is_usable_outline(cleaned) is True
    assert is_usable_outline("太短") is False


def test_mindmap_endpoint_builds_local_outline(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    _seed_session(client, session_id)

    response = client.get(f"/api/sessions/{session_id}/mindmap")
    assert response.status_code == 200

    data = response.json()
    assert data["source"] == "local"
    assert data["llm_configured"] is False
    assert data["segment_count"] == 4
    assert data["highlight_count"] == 2

    markdown = data["markdown"]
    assert markdown.startswith(f"# {created_session['title']}")
    assert "## 课程信息" in markdown
    assert "## 课堂标记" in markdown
    assert "### 重点" in markdown
    assert "[00:12] 极限的定义要记住（张老师）" in markdown
    assert "### 难点" in markdown
    assert "## 老师讲解" in markdown
    assert "今天我们讲函数的极限" in markdown
    # 关键词命中的作业/考试提示
    assert "## 作业与考试提示" in markdown
    assert "课后完成第三题的证明" in markdown
    assert "下节课我们讲连续与间断点" in markdown


def test_mindmap_endpoint_warns_when_llm_not_configured(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    response = client.get(f"/api/sessions/{session_id}/mindmap?prefer=llm")
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "local"
    assert data["warning"] is not None
    assert "未配置 LLM" in data["warning"]


def test_mindmap_prefer_local_has_no_warning(
    client: TestClient, created_session: dict
) -> None:
    session_id = created_session["id"]
    data = client.get(f"/api/sessions/{session_id}/mindmap?prefer=local").json()
    assert data["source"] == "local"
    assert data["warning"] is None


def test_mindmap_uses_llm_output_when_configured(
    client: TestClient, created_session: dict, monkeypatch
) -> None:
    session_id = created_session["id"]
    _seed_session(client, session_id)

    fake_settings = LLMSettings(
        base_url="http://127.0.0.1:9/v1",
        api_key="test-key",
        model="test-model",
        timeout_seconds=1.0,
    )
    monkeypatch.setattr(mindmap_router, "load_llm_settings", lambda: fake_settings)
    monkeypatch.setattr(
        mindmap_router,
        "generate_outline_markdown",
        lambda prompt, settings=None: ("# 模型大纲\n\n## 重点\n- 极限定义\n", None),
    )

    data = client.get(f"/api/sessions/{session_id}/mindmap?prefer=llm").json()
    assert data["source"] == "llm"
    assert data["llm_configured"] is True
    assert data["markdown"].startswith("# 模型大纲")
    assert data["warning"] is None


def test_mindmap_falls_back_when_llm_fails(
    client: TestClient, created_session: dict, monkeypatch
) -> None:
    session_id = created_session["id"]

    fake_settings = LLMSettings(
        base_url="http://127.0.0.1:9/v1",
        api_key="test-key",
        model="test-model",
        timeout_seconds=1.0,
    )
    monkeypatch.setattr(mindmap_router, "load_llm_settings", lambda: fake_settings)
    monkeypatch.setattr(
        mindmap_router,
        "generate_outline_markdown",
        lambda prompt, settings=None: (None, "LLM 返回 500：boom"),
    )

    data = client.get(f"/api/sessions/{session_id}/mindmap?prefer=llm").json()
    assert data["source"] == "local"
    assert data["warning"] is not None
    assert "回退到本地大纲" in data["warning"]
    assert data["markdown"].startswith(f"# {created_session['title']}")


def test_mindmap_missing_session_returns_404(client: TestClient) -> None:
    response = client.get("/api/sessions/not-a-real-session/mindmap")
    assert response.status_code == 404
