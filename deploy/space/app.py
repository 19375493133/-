"""路线 2 的部署入口：把「后端 API + FunASR 实时转写」合成一个进程、一个端口。

这样容器平台（魔搭创空间 / 云托管 / 任何 Docker 平台）只需要跑一个服务：

- `https://<实例域名>/api/...`   → 后端 API（会话、录音分片、重点提取、思维导图大纲）
- `https://<实例域名>/funasr/ws/sessions/{id}/live-transcribe` → FunASR 实时字幕

前端只要把 `NEXT_PUBLIC_API_BASE_URL` 指向这个域名（或走 Next 反向代理），
`NEXT_PUBLIC_FUNASR_API_URL` 指向 `<域名>/funasr` 即可。
"""

from __future__ import annotations

import importlib.util
import os
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path

_HERE = Path(__file__).resolve()


def _find_repo_root() -> Path:
    """本地开发时向上找仓库根目录；容器里就是 /app。"""
    for candidate in [_HERE.parent, *_HERE.parents]:
        if (candidate / "backend" / "app").is_dir() and (
            candidate / "funasr_backend" / "app.py"
        ).is_file():
            return candidate
    raise RuntimeError("找不到仓库根目录（需要同时包含 backend/ 和 funasr_backend/）")


REPO_ROOT = _find_repo_root()

# 本地直接跑 deploy/space/app.py 时，这个目录里也有个 app.py，
# 会把 backend 的包 `app` 挡住（容器里文件叫 space_app.py，不存在这个问题）。
_SHADOW_DIR = _HERE.parent
if (_SHADOW_DIR / "app.py").exists():
    _kept: list[str] = []
    for entry in sys.path:
        try:
            resolved = Path(entry or ".").resolve()
        except OSError:
            resolved = None
        if resolved != _SHADOW_DIR:
            _kept.append(entry)
    sys.path[:] = _kept

# funasr_backend 里的模块（例如 sentence_buffer）是按平铺方式互相导入的，
# 所以这个目录要留在 sys.path 上。
if str(REPO_ROOT / "funasr_backend") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "funasr_backend"))

os.environ.setdefault("MODELSCOPE_CACHE", str(REPO_ROOT / "data" / "modelscope"))


def _load_funasr_module():
    spec = importlib.util.spec_from_file_location(
        "funasr_service", REPO_ROOT / "funasr_backend" / "app.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 funasr_backend/app.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["funasr_service"] = module
    spec.loader.exec_module(module)
    return module


def _load_backend_app():
    """按文件路径加载 backend 的 `app` 包，避免和 funasr_backend/app.py 撞名。

    不用 `import app.main` 是因为 sys.path 上还有别的 `app.py`，
    解析结果取决于路径顺序，很容易踩坑；这里直接把包注册成 `app`，
    它内部的相对导入（from .routers import ...）和绝对导入都能正常工作。
    """
    package_dir = REPO_ROOT / "backend" / "app"
    spec = importlib.util.spec_from_file_location(
        "app",
        package_dir / "__init__.py",
        submodule_search_locations=[str(package_dir)],
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 backend/app")
    package = importlib.util.module_from_spec(spec)
    sys.modules["app"] = package
    spec.loader.exec_module(package)
    return importlib.import_module("app.main").app


funasr_service = _load_funasr_module()
api_app = _load_backend_app()


# 先把后端原来的 lifespan 抓住，否则下面覆盖之后再读就会读到自己（无限递归）。
_ORIGINAL_LIFESPAN = api_app.router.lifespan_context


@asynccontextmanager
async def combined_lifespan(app):  # type: ignore[no-untyped-def]
    """保留后端原来的 lifespan（建库/迁移），额外在启动时预热 FunASR 模型。"""
    async with _ORIGINAL_LIFESPAN(app):
        threading.Thread(target=funasr_service.get_model, daemon=True).start()
        yield


api_app.router.lifespan_context = combined_lifespan

# 把 FunASR 挂在 /funasr 下：/funasr/ws/sessions/{id}/live-transcribe
api_app.mount("/funasr", funasr_service.app)

app = api_app
