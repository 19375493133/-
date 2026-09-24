"""本地按「容器里的加载方式」启动合并入口，用来在没装 Docker 时先验证。

用法（本机需要同时具备 backend 与 funasr_backend 的依赖）：
    python deploy/space/run_local.py [端口]
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import uvicorn

HERE = Path(__file__).resolve().parent


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7860
    spec = importlib.util.spec_from_file_location("space_app", HERE / "app.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载 app.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["space_app"] = module
    spec.loader.exec_module(module)
    uvicorn.run(module.app, host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()
