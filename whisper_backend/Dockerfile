FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_ENDPOINT=https://hf-mirror.com \
    HF_HUB_DISABLE_TELEMETRY=1 \
    WHISPER_MODEL=base \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# 预下载模型，避免容器冷启动时再下载。
RUN python -c "import os; os.environ.setdefault('HF_ENDPOINT','https://hf-mirror.com'); from faster_whisper import WhisperModel; WhisperModel(os.getenv('WHISPER_MODEL','base'), device='cpu', compute_type='int8')"

COPY app.py .

EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
