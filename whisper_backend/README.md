# Classroom Whisper Backend

独立运行的免费 faster-whisper 转写服务。它接收浏览器录音上传的 WebM/WAV 文件，返回带时间戳的文本片段。

## 本地运行

```powershell
cd backend
python -m uv pip install --python .venv\Scripts\python.exe -r ..\whisper_backend\requirements.txt
cd ..\whisper_backend
$env:HF_ENDPOINT="https://hf-mirror.com"
$env:WHISPER_MODEL="base"
..\backend\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001
```

健康检查：

```powershell
Invoke-WebRequest http://127.0.0.1:8001/health
```

## 免费部署

### Render（推荐）

仓库中的 `render.yaml` 定义了一个免费 Docker Web Service。Render 免费实例会休眠，冷启动时模型加载会慢一些。

### Hugging Face Spaces

也可以使用 Docker Space。当前网络环境访问 Hugging Face 主站被拒绝，但代码已经内置 `HF_ENDPOINT=https://hf-mirror.com`，模型下载会走镜像。

## 环境变量

- `WHISPER_MODEL`：默认 `base`，可选 `tiny`、`small`。免费主机建议 `base` 或 `tiny`。
- `WHISPER_DEVICE`：默认 `cpu`。
- `WHISPER_COMPUTE_TYPE`：默认 `int8`。
- `HF_ENDPOINT`：默认 `https://hf-mirror.com`。
- `WHISPER_API_KEY`：可选。设置后请求需要带 `X-API-Key`。
- `CORS_ORIGINS`：允许访问的前端域名。

## API

`POST /api/transcribe`

表单字段：

- `file`：音频文件。
- `language`：默认 `zh`。
- `X-API-Key`：如果配置了 `WHISPER_API_KEY`。

返回：

```json
{
  "text": "识别出的完整文本",
  "language": "zh",
  "duration": 12.5,
  "segments": [
    { "text": "第一段", "start": 0.0, "end": 3.2 }
  ]
}
```
