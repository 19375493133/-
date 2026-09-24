from __future__ import annotations

import os
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# 必须在任何 app.* 模块被导入之前设好环境变量：只要有一个测试文件在模块顶层
# `from app.xxx import ...`，pytest 收集阶段就会先导入 app.config，那时 settings
# 已经绑定到真实数据库，后面的 fixture 再设环境变量就来不及了（会把测试数据写进
# 真实 data/app.db）。
_TEST_ROOT = Path(tempfile.mkdtemp(prefix="classroom-listener-test-"))
os.environ["DATA_DIR"] = str(_TEST_ROOT / "data")
os.environ["DATABASE_URL"] = f"sqlite:///{(_TEST_ROOT / 'test.db').as_posix()}"


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def created_session(client: TestClient) -> dict:
    response = client.post(
        "/api/sessions",
        json={
            "title": "高等数学：极限",
            "course": "高等数学",
            "teacher": "张老师",
            "date": "2026-09-17",
        },
    )
    assert response.status_code == 201
    return response.json()
