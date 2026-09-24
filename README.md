# 大学课堂听课助手

面向大学课堂的本地优先录音与课堂标记工具。当前为第一阶段：会话管理、浏览器录音、30 秒分片上传、ffmpeg 合并、重点/难点/问题/笔记标记；转写、LLM 分析和思维导图只预留接口，不返回伪造结果。

## 技术栈

- 前端：Next.js 14 + TypeScript strict + Tailwind CSS + shadcn/ui 风格组件
- 后端：FastAPI + SQLAlchemy 2 + SQLite + Pydantic v2
- 录音：浏览器 MediaRecorder API
- 音频合并：ffmpeg
- 包管理：前端 pnpm；后端 uv（同时兼容 pip）

## 目录

```text
frontend/   Next.js 前端
backend/    FastAPI 后端
data/       本地数据库、分片与合并音频
PLAN.md     实施计划与技术选型
```

## 环境要求

- Node.js 18.17+
- pnpm 9+
- Python 3.11+（推荐 3.11）
- uv，或 pip + venv
- ffmpeg（用于合并/转换 wav）

Windows 安装 ffmpeg 示例：

```powershell
winget install --id Gyan.FFmpeg -e --source winget
```

macOS：

```bash
brew install ffmpeg
```

## 快速开始（10 分钟内跑通）

### 1. 启动后端

```powershell
cd backend
python -m pip install uv
python -m uv sync --extra dev
.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> 也可以用 pip：`python -m venv .venv`，激活后 `pip install -e ".[dev]"`。
> 后端启动后可在浏览器打开 <http://127.0.0.1:8000/docs>。

### 2. 启动前端

另开一个终端：

```powershell
cd frontend
pnpm install
pnpm dev
```

打开 <http://127.0.0.1:3000>。

### 3. 启动 FunASR 实时转写服务（推荐）

FunASR Paraformer 是普通话课堂的默认转写引擎，没启动它时录音仍然可用，但不会有实时字幕：

```powershell
cd funasr_backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8002
```

首次启动会下载 `paraformer-zh-streaming` 模型（约 881MB），之后走本地缓存。
前端通过 `NEXT_PUBLIC_FUNASR_API_URL`（默认 `http://127.0.0.1:8002`）连接它。

Windows 上也可以用一键脚本，把后端、Whisper、FunASR 和前端都拉起来：

```powershell
.\start-all.ps1
```

### 4. 完成一次课堂录音流程

1. 首页点击“新建会话”。
2. 填写标题、课程、教师、日期。
3. 点击“去录音”，允许浏览器访问麦克风。
4. 点击“开始录音”，每 30 秒会自动上传一个分片；开启实时语音转文字后 1-3 秒内会出现字幕。
5. 可点击“暂停 / 继续”，也可在右侧标记重点、难点、问题、笔记。
6. 点击“停止并合并”，后端使用 ffmpeg 合并为 wav。
7. 返回详情页下载合并后的音频，并查看标记。

## 后端配置

复制根目录 `.env.example` 为 `.env`：

```text
DATA_DIR=./data
DATABASE_URL=sqlite:///./data/app.db
FFMPEG_PATH=
```

不设置 `FFMPEG_PATH` 时，后端会从系统 `PATH` 查找 `ffmpeg`。找不到时会返回清晰错误，录音分片仍保留在本地。

## 主要 API

### 实时语音转文字

第一阶段已经实现实时转写 MVP，采用可插拔 Provider：

- `funasr`：FunASR Paraformer 流式模型，针对普通话优化，推荐中文课堂。
- `webspeech`：浏览器内置 Web Speech API，免费、低延迟。
- `backend_ws`：通过 `/ws/sessions/{id}/live-transcribe` 连接后端流式 ASR（当前免费 MVP 使用 faster-whisper 服务）。
- `mock`：无网络、无 API Key 时的演示 Provider，所有文本都带 `[MOCK]` 标记，不会写入正式转写结果。

FunASR Provider 使用独立的 `funasr_backend` 服务：

```powershell
cd funasr_backend
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8002
```

首次启动会下载 `paraformer-zh-streaming` 模型（约 881MB）。前端通过
`NEXT_PUBLIC_FUNASR_API_URL` 指向该服务。AudioWorklet 每约 300ms 发送一次
16kHz 单声道 PCM，FunASR 返回 interim/final 字幕。

关于 FunASR 的几个实现细节：

- **默认 Provider**：只要配置了 `NEXT_PUBLIC_FUNASR_API_URL`，录音页默认就用 FunASR；旧的 v1 本地设置如果还停在 `backend_ws`，会在读取时自动升级到 `funasr`（你在设置页手动选的 `mock` 不会被改）。
- **按句出字幕**：Paraformer 流式模型每 600ms 吐一小段、不带标点。服务端按“约 20 字或 5 秒”把它们合成一条 final，避免 18 秒讲话落库 26 条字幕。可用环境变量 `FUNASR_FINAL_MAX_CHARS`、`FUNASR_FINAL_MAX_SECONDS` 调整。
- **停止不丢尾巴**：点“停止并合并”时前端先发 `end` 再等 0.8 秒关闭连接，让服务端把最后半句补成 final。
- **失败不影响录音**：FunASR 连不上时页面会显示提示，录音和分片上传继续走。

录音页默认开启实时转写，并显示：

- interim 临时字幕（灰色、斜体，不落库）
- final 最终字幕（固定显示，可点击时间戳跳转录音）
- final 字幕编辑按钮，编辑后不会被后续自动结果覆盖
- 实时思维导图预览

设置页 `/settings` 可以切换 Provider、语言，维护课程术语/人名/缩写词库，并查看隐私提示。

停止录音后，如果实时转写不可用，会话状态会变为 `pending_batch_transcribe`，音频仍然正常保存，等待第二阶段批处理校正。

### 会话

- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `PATCH /api/sessions/{id}`
- `DELETE /api/sessions/{id}`
- `GET /api/sessions/{id}/status`

### 分片与合并

- `POST /api/sessions/{id}/chunks`
- `GET /api/sessions/{id}/chunks`
- `POST /api/sessions/{id}/finalize`
- `GET /api/sessions/{id}/audio`
- `POST /api/sessions/{id}/finalize` 支持 `realtime_transcribe_enabled`

### 实时转写与 transcript

- `WS /ws/sessions/{id}/live-transcribe`
- `GET /api/sessions/{id}/transcript?source=realtime`
- `POST /api/sessions/{id}/transcript`
- `PATCH /api/transcript/segments/{id}`

### 标记

- `POST /api/sessions/{id}/highlights`
- `GET /api/sessions/{id}/highlights`

### 个性化词库（第一阶段基础 CRUD）

- `GET /api/glossary`
- `POST /api/glossary`
- `DELETE /api/glossary/{id}`

### 后续能力占位

以下接口返回 HTTP 501，表示已预留但尚未实现：

- `GET /api/sessions/{id}/export`

> `/analyze` 已经从占位接口升级为「结构化重点提取」，见上面的思维导图小节。

### 思维导图（Markdown 大纲 → markmap）

- **生成分两步**（借鉴 open-notebook 的结构化思路）：
  1. `POST /api/sessions/{id}/analyze?prefer=auto|local|llm` 先把课堂内容提取成**结构化重点**
     （`key_point` 重点 / `difficult` 难点 / `example` 例子 / `homework` 作业 / `exam` 考试提示 / `term` 术语），
     结果写入 `analysis_results` 表，可单独展示、刷新不丢；
  2. `GET /api/sessions/{id}/mindmap` 把这些重点 + 时间轴拼成 Markdown，交给 markmap 出图。
- `GET /api/sessions/{id}/analysis` 读取已保存的重点（页面刷新后仍然是同一份）。
- 前端「提取重点并出图」按钮就是这两步；重点会以分类标签 + 时间戳列表的形式显示在图上。
- `GET /api/sessions/{id}/mindmap?prefer=auto|local|llm` 返回 **Markdown 大纲**，前端用
  [markmap](https://markmap.js.org/) 渲染成可折叠、可缩放的思维导图，支持一键导出 SVG。
- 导图样式：黑底根节点、彩色一级分支方块、右侧纯文字子节点、按分支着色的连线，浅色画布便于阅读和打印。
- `prefer=local`：后端按规则整理课程信息、课堂标记、作业/考试关键词命中，以及按时间轴分段的
  老师讲解，**不调用任何模型**。
- `prefer=llm`：配置了 LLM 时由模型直接输出 Markdown 大纲；失败会自动回退到本地大纲并提示原因。
- 未配置 LLM 时页面明确显示「未配置 LLM，当前展示本地规则化大纲」，不会伪造 AI 结果。

要启用模型生成，在 `.env` 里设置（支持任何 OpenAI 兼容接口，含本地部署的模型）：

```text
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

录音页在录音过程中用浏览器内联大纲实时刷新，点「用模型生成大纲」或停止录音后会调用后端大纲接口。

## 测试与构建

后端：

```powershell
cd backend
.venv\Scripts\python.exe -m ruff check app tests
.venv\Scripts\python.exe -m pytest
```

> 测试使用临时数据库，不会动你的 `data/app.db`（`tests/conftest.py` 在任何 app 模块被导入前
> 就设好 `DATA_DIR` / `DATABASE_URL`）。如果发现会话列表里出现大量重复的测试会话，
> 说明隔离被破坏了，检查是否有测试文件在模块顶层 `from app... import ...`。

前端：

```powershell
cd frontend
pnpm lint
pnpm test
pnpm build
```

## 数据模型

- `Session`：id、title、course、teacher、date、status、duration、error_message、merged_audio_path、created_at、updated_at。
- `RecordingChunk`：id、session_id、chunk_id、chunk_index、file_path、起止秒数、大小、sha256、created_at。
- `Highlight`：type 支持 `important` / `difficult` / `question` / `note`，并记录时间戳和可选 `speaker`。
- 预留：`TranscriptionSegment`（含 speaker/start/end/text）、`AnalysisResult`、`MindMapNode`、`GlossaryEntry`。

## 状态流转

```text
created -> recording -> uploading -> done
                          └-> failed
```

后续再接入：`done -> transcribing -> analyzing -> done`。

## 已知限制

- 实时转写已经可用（FunASR Paraformer 流式 / 浏览器 Web Speech / 后端 Whisper / Mock），但**录音结束后的批处理校正还没有实现**，`POST /api/sessions/{id}/transcribe` 等接口仍返回 501。
- FunASR 用的是不带标点的流式模型，字幕按句聚合但没有逗号句号；后续可加 `ct-punc` 标点模型。
- LLM 重点难点分析（`/analyze`）和导出（`/export`）仍未实现；思维导图已经是「Markdown → markmap」真实渲染，
  但没配 LLM 时用的是后端规则化大纲（页面会标明来源，不会冒充 AI 结果）。
- 前端在无法连接 FastAPI 后端时（例如 Netlify 线上部署）会自动把会话和标记保存到当前浏览器的 localStorage；录音分片上传和 ffmpeg 合并仍然需要后端服务。
- 分片合并要求同一会话的分片索引从 0 开始且连续；若页面在录音中途刷新，无法用 MediaRecorder 原样恢复录音，但已上传分片不会丢失，可到详情页合并。
- 分片容器格式取决于浏览器（通常为 webm/opus），ffmpeg 会统一转成 16 kHz 单声道 wav。
- 无头浏览器无法验证真实麦克风的音质；正式使用前建议用真机教室录音再听一遍字幕质量。
- 本地优先，暂不提供云端同步和多设备协同。

## 下一步建议

1. 录音结束后用 faster-whisper 做批处理校正（当前实时字幕会保留，批处理结果作为 `source=batch` 补充）。
2. 给 FunASR 接上 `ct-punc` 标点模型，让字幕和思维导图更易读。
3. 接入 LLM 分析，生成重点、难点、例子、作业和考试提示。
4. 根据转写与分析结果生成完整思维导图节点，并支持导出。
5. 让个性化词库真正参与转写（作为热词/纠错表），当前只做了 CRUD。
6. 若后续需要听脑云转写，可基于统一 Provider 接口实现 `TingnaoProvider`。

## 手机或公网访问

> 想做成微信小程序？先看 [WECHAT_MINIPROGRAM.md](WECHAT_MINIPROGRAM.md)：里面写清了官方限制、
> 三条可行路线和分阶段实施步骤（仅调研，未做任何上传）。
> 想把它装到云服务器上？看 [CLOUD_HOSTING.md](CLOUD_HOSTING.md)：免费/付费机器对比、开源自建
> 云平台（Coolify / Dokploy）和 Docker 部署草图。
>
> 想看「听脑 AI」这类产品的开源替代？看 [TINGNAO_ALTERNATIVES.md](TINGNAO_ALTERNATIVES.md)；
> 文字转思维导图的工具横评看 [MINDMAP_TOOLS.md](MINDMAP_TOOLS.md)。
>
> 想让程序**脱离本机、不用一直开着电脑**？看 [FREE_HOSTING_OPTIONS.md](FREE_HOSTING_OPTIONS.md)。
> 想用腾讯云 Cloud Studio 跑成网站：看 [docs/CLOUDSTUDIO.md](docs/CLOUDSTUDIO.md)
> （一键启动脚本 `tools/cloudstudio-start.sh`，上传包用 `.tools/pack-for-cloudstudio.ps1` 生成）。
> 已经选好路线想动手：容器化 + 上架步骤在 [deploy/space/README.md](deploy/space/README.md)。
> 要上传到微信小程序：原生小程序工程在 [miniprogram/](miniprogram/README.md)，
> 打包用 `.tools/pack-miniprogram.ps1`（产物在 `dist/`）。
> 小程序名为「聆听」，AppID `wx9cb9eb6d646e8d71`，默认走微信云托管（不用备案域名）。
> 云函数与云数据库（环境 `cloud1-d9g8ggp3eba5ba3c0`）见 [cloudbase/README.md](cloudbase/README.md)，
> 一键部署：`.\cloudbase\deploy.ps1 -BackendBaseUrl "https://你的后端地址"`。

### 一键上线（推荐）

双击仓库根目录的 **`go-online.cmd`**，它会：

1. 启动后端（8000）和 FunASR（8002），并等它们真的响应；
2. 复用/新建 Cloudflare 隧道，公网地址记录在 `data/tunnels.json`、`data/public-url.txt`；
3. 用独立构建目录 `.next-public` 构建并启动“公网版”前端（3001）；
4. 打印手机可以打开的 `https://xxxx.trycloudflare.com` 地址，并自动在电脑浏览器打开一次。

手机上打开这个地址 → 允许麦克风 → 点“开始录音”，1-3 秒内就会出现实时字幕。

公网版前端只暴露一个端口：页面和 `/api` 同源，`/api` 由 Next 反向代理到本机 8000，
FunASR 的 WebSocket 走它自己的隧道（地址在构建时写进前端）。所以**只需要两条隧道**。

注意事项：

- 电脑必须开机且不休眠，隧道地址才有效；关机后地址失效，重新运行 `go-online.cmd` 会生成新地址。
- 停止所有服务（含隧道）运行 `stop-all.cmd`。
- 快速隧道是 Cloudflare 的免费试用通道，没有可用性保证，长期使用建议把后端部署到
  Hugging Face Spaces 或 ModelScope 创空间，前端部署到 Netlify/Vercel。
- 手机上录音走的是 HTTPS，浏览器才会给麦克风权限；直接在手机浏览器输入电脑的
  `http://192.168.x.x:3000` 是不行的（非安全上下文）。

### 手动方式

```powershell
\.\start-all.ps1                                   # 本地四件套
\.\.tools\go-public.ps1 -SkipBuild                 # 复用已有公网构建，只开隧道
```

只想在内网用（不经过 Cloudflare）也可以，但麦克风会被浏览器拦截，需要自行配置 HTTPS 证书。

## 维护脚本

`\.tools\` 下有几个开发/维护脚本（不参与构建）：

- `clean_prompt_leak.py`：清理早期 Whisper 把提示词复读进正文的脏字幕，删除前会自动备份 `data/app.db`。
- `session_report.py`：列出所有会话及其分片/字幕/标记数量，用来判断哪些是测试数据。
- `reset_test_data.py`：清空测试数据 —— 先备份数据库，再把 `data/sessions/*` 移到 `data/trash/`（可恢复），最后清空会话表。加 `--dry-run` 只预览。
- `funasr_ws_test.py`：把一段 16kHz 单声道 wav 直接喂给 FunASR，验证转写质量。
- `e2e-record-funasr.mjs`：用无头 Edge + 假麦克风跑完整的“录音 → 实时转写 → 落库”验收。
- `probe-mindmap.mjs`：检查页面上 markmap 是否渲染成功，并可模拟点击「用模型生成大纲」。
- `fake_llm_server.py`：本地假的 OpenAI 兼容服务，用来验证 LLM 大纲链路（不参与产品运行）。
- `restart-service.ps1` / `restart-frontend.ps1`：重启本地服务，不弹窗口。
