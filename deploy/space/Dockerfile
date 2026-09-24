# 路线 2：一个容器同时跑「后端 API + FunASR 实时转写」，对外只暴露 7860 端口。
#
# 构建（在仓库根目录执行，build context 必须是仓库根目录）：
#   docker build -f deploy/space/Dockerfile -t classroom-assistant .
#
# 在魔搭创空间/云托管上：把本文件放到空间仓库根目录并命名成 Dockerfile，
# 同时把 backend/、funasr_backend/、deploy/space/app.py 一起上传（步骤见 README.md）。

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# ffmpeg 用于把浏览器上传的 webm 分片合并成 wav
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY deploy/space/requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY backend ./backend
COPY funasr_backend ./funasr_backend
COPY deploy/space/app.py ./space_app.py

# 可选：构建时就把 FunASR 模型下载进镜像（镜像会大 ~900MB，但冷启动快很多）。
# 不想让镜像变大就注释掉这一段，模型会在第一次使用时才下载。
RUN python -c "from funasr import AutoModel; AutoModel(model='paraformer-zh-streaming', model_revision='v2.0.4', disable_update=True); print('model cached')"

ENV DATA_DIR=/data \
    MODELSCOPE_CACHE=/data/modelscope \
    MODELSCOPE_CACHE_DIR=/data/modelscope \
    PYTHONPATH=/app:/app/backend:/app/funasr_backend

RUN mkdir -p /data

EXPOSE 7860

# 注意：容器里的 SQLite 和录音文件在 /data 下；平台若不提供持久卷，
# 实例重启后数据会丢（个人使用可接受，正式使用建议挂载持久存储）。
CMD ["uvicorn", "space_app:app", "--host", "0.0.0.0", "--port", "7860"]
