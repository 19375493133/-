# FunASR Paraformer Streaming Backend

基于 FunASR `paraformer-zh-streaming` 的普通话实时转写服务。

## 启动

```powershell
cd funasr_backend
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8002
```

## WebSocket

`WS /ws/sessions/{id}/live-transcribe`

音频消息格式：

```json
{
  "type": "audio",
  "data": "base64 编码的 16kHz 单声道 PCM16",
  "sample_rate": 16000,
  "start_ms": 0,
  "end_ms": 600
}
```

返回：

```json
{"type":"interim","text":"...","start_ms":0,"end_ms":600}
{"type":"final","text":"...","start_ms":0,"end_ms":600,"speaker":null}
```
