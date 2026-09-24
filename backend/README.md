# 大学课堂听课助手后端

FastAPI + SQLAlchemy + SQLite 后端。第一阶段负责会话、录音分片上传、ffmpeg 合并和课堂标记。

```bash
cd backend
python -m uv sync --extra dev
.venv\Scripts\activate
uvicorn app.main:app --reload
```

更完整的启动说明见仓库根目录 `README.md`。
