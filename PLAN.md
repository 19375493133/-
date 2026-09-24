# 大学课堂听课助手 · 实施计划

## 项目目标

面向大学课堂场景的本地优先录音与课堂笔记工具。最终愿景：

1. 上课时用浏览器录音；
2. 实时或结束后转写；
3. 自动提取重点、难点、例子、作业、考试提示；
4. 录音结束后生成从开始到结束的思维导图；
5. 支持导出。

本轮只实现第一阶段：项目初始化、听课会话管理、浏览器录音、分片上传与音频合并、录音中标记，以及为后续转写/分析/思维导图预留接口与数据结构。

### 第一阶段修订（实时语音转文字 MVP）

第一阶段不再只是“预留转写接口”，必须实现可用的实时语音转文字 MVP，并采用可插拔 Provider 架构。录音结束后的 faster-whisper 批处理校正保留到第二阶段实现。

## 技术选型结论

### 转写底层能力评估

已评估 [https://github.com/itingnao/tingnao-cli-skills](https://github.com/itingnao/tingnao-cli-skills)：

- 可用性：仓库存在且可访问，README、SKILL.md、package.json 可正常读取。
- 形态：它是面向 OpenClaw / CLI 的 Node.js 工具，不是可被 FastAPI 直接 import 的 Python 库。
- 运行前提：依赖听脑云 API 和 `ITINGNAO_API_KEY`，上传到 OSS，走云端异步任务。
- 许可证：MIT-0，许可证宽松，可作为未来云转写适配器。
- 稳定性：作为外部 SaaS CLI 可用，但与本项目“本地优先、断网可录音、音频默认存本地”的第一阶段目标不完全匹配。

结论：**第一轮不直接将其作为底层依赖接入**。采用自建 faster-whisper 本地转写方案作为默认路线，但架构上预留统一的 `TranscriptionProvider` 接口。后续需要云端转写时，可单独实现 `TingnaoProvider` 或 CLI 适配器，不重写业务层。

补充评估：听脑 CLI 当前提供的是“上传文件 / 提交链接 -> 云端异步任务 -> 轮询结果”，**不支持流式或实时转写**。因此实时语音转文字 MVP 不接入听脑，按以下顺序降级：

1. 默认实现 `BrowserWebSpeechProvider`：使用浏览器 Web Speech API，快速跑通实时字幕。
2. 实现 `BackendWebSocketASRProvider` 接口和 `/ws/sessions/{id}/live-transcribe` 端点，预留后端流式 ASR。
3. 实现 `MockProvider`，用于无网络、无 API Key 时演示；所有 mock 文本必须明确标记，不写入正式转写结果。
4. 录音结束后的 faster-whisper 批处理校正保留到第二阶段。

实时转写不可用时，页面必须显示“实时转写不可用”，但录音、分片上传和合并流程继续正常工作。

## 本轮技术栈

- 前端：Next.js 14 + TypeScript strict + Tailwind CSS + shadcn/ui 风格组件。
- 后端：FastAPI + Python 3.11+ + SQLAlchemy 2 + SQLite + Pydantic v2。
- 录音：浏览器 MediaRecorder API。
- 音频处理：ffmpeg 合并分片并转 wav；未安装时返回清晰错误。
- 包管理：前端 pnpm；后端 uv（`uv.lock` + `pyproject.toml`，也兼容 pip）。
- 测试：后端 pytest；前端 Vitest 基础测试 + `next build`。

## 目录结构

```text
.
├── PLAN.md
├── README.md
├── .env.example
├── .gitignore
├── data/                     # 运行时数据，默认不提交
├── frontend/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── next.config.mjs
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── components.json
│   └── src/
│       ├── app/
│       ├── components/
│       └── lib/
└── backend/
    ├── pyproject.toml
    ├── uv.lock
    ├── app/
    │   ├── main.py
    │   ├── config.py
    │   ├── database.py
    │   ├── models.py
    │   ├── schemas.py
    │   ├── services/
    │   └── routers/
    └── tests/
```

## 里程碑与任务

### M1：项目初始化

- [x] 确定技术选型与目录结构。
- [x] 创建根级配置：`.env.example`、`.gitignore`、`README.md`、`PLAN.md`。
- [x] 初始化后端 FastAPI 工程和测试框架。
- [x] 初始化前端 Next.js + TypeScript + Tailwind 工程。
- [x] 跑通后端 `pytest`、前端 `pnpm lint` / `pnpm test` / `pnpm build`。

### M2：会话管理

- [x] 定义 `Session` 数据模型与 Pydantic Schema。
- [x] 实现会话 CRUD API。
- [x] 实现会话列表、新建、详情、删除前端页面。
- [x] 覆盖会话 CRUD 测试。

### M3：浏览器录音与分片上传

- [x] 实现录音页 UI 与录音前置法律/课堂提示。
- [x] 使用 MediaRecorder 实现开始、暂停、继续、停止。
- [x] 每 30 秒切分并上传一个音频分片。
- [x] 上传失败自动重试，同 `chunk_id` 幂等，支持分片级续传。
- [x] 录音页显示计时与实时音量波形。
- [x] 后端保存分片并校验 `chunk_index` 连续性。

### M4：音频合并

- [x] `RecordingChunk` 数据模型与分片存储。
- [x] `POST /api/sessions/{id}/finalize` 调用 ffmpeg 合并为 wav。
- [x] 未安装 ffmpeg 时返回 503 和可读错误信息。
- [x] 覆盖分片上传、重复分片、缺失分片、合并失败等测试。

### M5：课堂标记与随想随记

- [x] 定义 `Highlight`，`type` 支持 `important` / `difficult` / `question` / `note`。
- [x] 录音过程中标记重点、难点、问题、笔记，并记录时间戳。
- [x] 支持可选 `speaker` 字段，为声纹角色区分预留。
- [x] 会话详情页展示标记列表。

### M6：后续能力预留

- [x] 定义 `TranscriptionSegment`（含 `speaker`、`start`、`end`、`text`）。
- [x] 定义 `AnalysisResult`、`MindMapNode`、`GlossaryEntry`。
- [x] 为转写、分析、思维导图、导出添加 501 占位 API，不伪造结果。
- [x] 预留个性化词库设置项：课程术语、人名、缩写。

### M8：实时语音转文字 MVP

- [x] PLAN.md 修订：第一阶段必须实现实时转写 MVP。
- [x] 评估听脑 CLI：不支持流式/实时转写，降级到浏览器 Web Speech Provider。
- [x] 前端 Provider 架构：`webspeech` / `backend_ws` / `mock`。
- [x] 录音页实时字幕：interim 灰色、final 固定显示、自动滚动。
- [x] 点击字幕时间戳跳转到录音对应位置。
- [x] final 字幕可手动编辑，编辑后不被后续自动结果覆盖。
- [x] 后端 WebSocket：`/ws/sessions/{id}/live-transcribe`。
- [x] WebSocket 接收音频帧或文本事件，返回 interim / final / error。
- [x] `TranscriptSegment` 增加 `source`、`status`、`edited` 字段。
- [x] final 字幕落库，interim 只在前端内存显示。
- [x] WebSocket 断线重连，缓冲 5-10 秒音频后续传。
- [x] 实时转写失败时录音不中断，停止后状态变为 `pending_batch_transcribe`。
- [x] 设置页：实时转写开关、Provider、语言、词库、隐私提示。
- [x] 会话详情页显示 transcript 列表。
- [x] 增加 transcript 查询和编辑 API。
- [x] 增加实时转写相关后端和前端测试。

### M9：FunASR Paraformer 接入

- [x] 评估 FunASR `paraformer-zh-streaming` 模型。
- [x] 新增独立 `funasr_backend` 服务。
- [x] 新增 WebSocket `/ws/sessions/{id}/live-transcribe` 流式接口。
- [x] 前端新增 `FunASRBackendProvider`。
- [x] 使用 AudioWorklet 采集 16kHz 单声道 PCM，每约 300ms 发送一次。
- [x] 设置页增加 FunASR Provider 选项。
- [x] 用真实中文语音验证 Paraformer 转写质量（SAPI 合成课堂语句 + 无头 Edge 假麦克风端到端）。

### M10：FunASR 转写质量与接入收尾

- [x] 新增 `funasr_backend/sentence_buffer.py`，把 600ms 碎片聚合成句子：约 20 字或 5 秒一条 final，可用 `FUNASR_FINAL_MAX_CHARS` / `FUNASR_FINAL_MAX_SECONDS` 调整。
- [x] interim 显示“本句到目前为止”的累计文本，final 才落库，避免 18 秒讲话落库 26 条字幕。
- [x] 停止录音时前端先发 `end` 再延迟 0.8 秒关闭连接，最后半句不会丢。
- [x] FunASR 服务不可用时页面显示明确提示，录音与分片上传继续。
- [x] 录音启动失败（例如麦克风被拒绝）时显示错误并保持在可重试状态。
- [x] 前端 ASR 设置升级到 v2：旧 `backend_ws` 设置在 FunASR 可用时自动迁移到 `funasr`，手动选择的 `mock` 保持不变。
- [x] 本地 `.env.local` 直连 `127.0.0.1` 服务，不再依赖临时隧道。
- [x] Whisper 批处理结果同样清洗提示词复读，避免 `请使用简体中文输出。` 再次污染正文。
- [x] 清理历史脏字幕（先备份 `data/app.db`，只删除命中提示词特征的片段）。
- [x] 增加 `sentence_buffer` 单元测试与前端设置迁移测试。
- [x] 无头 Edge + 假麦克风端到端验收：录音 → 实时字幕 → 落库 → 合并。

### M12：思维导图改为「Markdown 大纲 → markmap」

- [x] 后端新增 `services/outline.py`：规则化生成 Markdown 大纲（课程信息 / 课堂标记 / 作业考试关键词命中 / 按时间轴分段的讲解）。
- [x] 后端新增 `services/llm.py`：可选 LLM（任何 OpenAI 兼容接口），**未配置时不调用、不伪造**。
- [x] `GET /api/sessions/{id}/mindmap` 从 501 占位升级为返回 Markdown 大纲，支持 `prefer=auto|local|llm`，失败自动回退并带 warning。
- [x] 前端引入 `markmap-lib` + `markmap-view`，新增 `components/markmap-view.tsx`：懒加载渲染、缩放、适应窗口、导出 SVG。
- [x] 新增 `components/mind-map.tsx` 的 `MindMapPanel`：来源标签（实时本地 / 本地 / 模型）、Markdown 源码展开、一键生成。
- [x] 录音页实时用本地大纲刷新，停止录音或点击按钮时调用后端大纲接口。
- [x] 思维导图页与详情入口同步改造，保留 whisper 转写兜底入口。
- [x] 后端 26 个测试、前端 25 个测试通过；无头浏览器验证 markmap 真实渲染节点。
- [x] 用假 LLM 服务验证 `prefer=llm` 链路（模型输出 Markdown → markmap 渲染，标签显示“模型生成大纲”）。
- [x] 思维导图视觉改成经典样式：黑底根节点 + 彩色一级分支方块 + 右侧纯文字子节点 + 浅色画布、彩色连线（按用户给的参考图）。
- [x] 作业/考试提示的关键词命中去重，同一句话不会重复出现在两个分组里。

### M18：Cloud Studio 部署方案

- [x] 核实官方预览地址规则（腾讯云文档 product/1039/131933）：`https://${X_IDE_SPACE_KEY}--${PORT}.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}`，服务需监听 `0.0.0.0`。
- [x] 确认能力边界：Cloud Studio 是**云端开发环境**（按机时计费、空间停机即断链），不是 7×24 托管平台。
- [x] 新增 `tools/cloudstudio-start.sh`：一键建 venv → 装后端+FunASR+前端依赖 → 起 API(7860) + 前端(3000) → 按官方规则打印手机访问地址（含 CORS 自动配置）。
- [x] 新增 `tools/cloudstudio-stop.sh` 停止脚本。
- [x] 新增 `.tools/pack-for-cloudstudio.ps1`：打成 1.5MB 干净上传包，并对 10 个关键文件做自检（缺文件直接报错，不产出坏包）。
- [x] 新增 `docs/CLOUDSTUDIO.md`：完整步骤 + 已知限制。
- [ ] 实际创建空间并部署（需要用户登录腾讯云账号）。
- [ ] 真机验证：本机无 Linux/bash 环境，脚本未在 Cloud Studio 内执行过。

### M17：设计精修（impeccable skill）

- [x] 安装 impeccable skill（pbakaus/impeccable v4.3.1，Apache-2.0）到 `~/.codex/skills/impeccable`。
- [x] 按 skill 流程跑 `impeccable context` 载入项目上下文；`request_user_input` 在 Default 模式不可用，改为"明确假设 + 声明"（Web 应用、精修而非换世界）。
- [x] 按 `polish` playbook + `craft-floor` 做批量取证（桌面 1440 / 手机 390）并修掉以下缺陷：
  - 首页标题上方的 uppercase 眉标（craft floor 明令禁止）；
  - 过期文案"转写与分析能力即将接入"；
  - **卡片套卡片**（首页列表卡里每行又是一个卡）；
  - 每行三个等重按钮、"删除"为红色实心，破坏主次；
  - 字幕每行一张卡（100 段 = 无休止滚动）→ 改为时间戳列 + 分隔线的时间轴；
  - 编辑铅笔被 `justify-between` 推到最右、与文字脱节；
  - 原生 `<audio>` 与控制条未做主题 → `color-scheme: dark` + 选区/焦点环/滚动条统一主题化。
- [x] 修掉一处隐性缺陷：会话行元信息在手机端换行错乱（`创建于` 改为 `sm:` 以上才显示）。
- [x] 验证：`impeccable detect --json` 返回 `[]`（无残留缺陷）；tsc / eslint / vitest 30 项 / 生产构建全部通过。

### M17：微信云开发（云函数 + 云数据库）

- [x] 环境确认：`cloud1-d9g8ggp3eba5ba3c0`（应用 且停行 / wx9cb9eb6d646e8d71，免费开发环境）。
- [x] 云函数 `api`：小程序 → 云函数（微信内网）→ 后端容器，**小程序端无需配置任何服务器域名**；带路径白名单、请求体上限、超时与错误透传。
- [x] 云函数 `initdb`：创建云数据库集合 `sessions` / `transcripts` / `notes` / `_meta`，写入结构版本，可重复执行。
- [x] `cloudbase/cloudbaserc.json` + `deploy.ps1`：一条命令完成登录检查、部署两个函数、初始化数据库（含 BACKEND_BASE_URL 写入）。
- [x] 本地验证云函数转发逻辑：5/5 通过（GET / 带 body 的 POST / 拦截非法路径 / 透传 404 / 未配置地址时报错）。
- [x] 小程序新增 `cloudfn` 连接方式（默认），并把上传改成**边录边传分片**（10s/20s/30s 按通道区分），长课堂不再撑爆内存与请求体限制。
- [x] 新增 `utils/clouddb.js`：录音结束后把会话/转写/重点写入云数据库（按 _openid 自动隔离）。
- [ ] 实际部署：需要先在本机登录云开发（`tcb login`）或提供腾讯云 API 密钥。

### M16：微信小程序包（原生）

- [x] 新增 `miniprogram/`：原生小程序工程（无 npm / 无构建），可直接导入微信开发者工具并上传。
- [x] 页面：会话列表/新建、录音页（计时+波形+实时字幕+标记+随想随记）、详情页（重点/转写/大纲）、设置页（后端地址）、web-view 页（企业主体套壳）。
- [x] 录音改用 `wx.getRecorderManager()`：`format: PCM`、16kHz 单声道、`frameSize` 分帧，帧内算 RMS 画波形。
- [x] 实时字幕走 `wx.connectSocket` 连 `/funasr/ws/sessions/{id}/live-transcribe`，final 段落回写 `/api/sessions/{id}/transcript`。
- [x] 停止录音：把 PCM 帧拼成标准 WAV（44 字节头）→ `wx.uploadFile` 传 `/chunks` → 调 `/finalize` 合并。
- [x] 官方 10 分钟限制：到 9.5 分钟自动续录一段（同一会话连续累积）。
- [x] 全局 `RecorderManager` 监听只绑定一次，避免反复进出录音页重复回调。
- [x] `.tools/pack-miniprogram.ps1` 打包到 `dist/classroom-listener-miniprogram.zip`。
- [ ] 真机验证（本机没有微信开发者工具）：PCM 帧兼容性、续录拼接断点、切后台恢复、WAV 分片合并。

### M15：容器化 + 上云（路线 2：前端 Vercel + 后端容器）

- [x] 新增 `deploy/space/app.py`：把 backend 的 FastAPI 与 FunASR 合并成一个进程，FunASR 挂在 `/funasr` 下（WS 路径 `/funasr/ws/sessions/{id}/live-transcribe`）。
- [x] 解决两个服务都叫 `app` 的命名冲突：按文件路径显式加载 backend 包，不再依赖 `sys.path` 顺序。
- [x] 保留后端原 lifespan 并在启动时预热 FunASR 模型（修掉了覆盖 lifespan 导致的自递归）。
- [x] 新增 `deploy/space/Dockerfile`（python:3.11-slim + ffmpeg + 依赖 + 可选模型预下载）、`requirements.txt`、`.dockerignore`。
- [x] 新增 `deploy/space/run_local.py` 与 `.tools/start-space-local.ps1`：没装 Docker 也能按容器方式本地验证。
- [x] 新增 `.tools/prepare-space-upload.ps1`：生成 0.3MB 的干净上传目录（排除 .venv / 模型缓存 / data）。
- [x] 新增 `.tools/e2e-record-funasr.mjs --json` 与 `.tools/run-space-rounds.mjs`，用「space 模式」前端跑多轮验收。
- [x] **实测 5/5 轮通过**：录音 → FunASR 实时字幕（每轮 3 段）→ 合并落库 → 提取重点 → markmap 出图（13 节点）。
- [x] 测试数据已清理：新增 `.tools/delete_test_sessions.py`（按标题前缀删除 + 备份 + 移入回收站）。
- [ ] 实际上架（创建魔搭创空间 / Vercel 项目）——需要账号登录，见 `deploy/space/README.md`。

### M14：重点提取（open-notebook 思路）+ markmap 出图

- [x] 新增 `services/analysis.py`：把课堂内容提取成结构化要点（重点/难点/例子/作业/考试提示/术语），规则版不调用模型；LLM 版要求模型输出 JSON 数组并做宽松解析。
- [x] `POST /api/sessions/{id}/analyze?prefer=auto|local|llm` 从 501 占位升级为真实实现，结果写入 `analysis_results` 表（复用第一阶段预留的数据模型）。
- [x] 新增 `GET /api/sessions/{id}/analysis`：读取已保存的重点，页面刷新不丢。
- [x] `GET /api/sessions/{id}/mindmap` 改为**优先使用结构化重点**成节（## 重点（N）/难点/例子/作业/考试提示/术语），没有重点时退回原来的规则化大纲。
- [x] 前端「提取重点并出图」按钮：先 analyze 再 getMindMapOutline；页面上直接显示分类标签 + 带时间戳的重点列表，点击可跳转录音。
- [x] 前端 `lib/analysis.ts` 提供同样的本地规则提取，后端不可用时也能出重点。
- [x] 同一句话只归到一个分类（避免「作业…下节课预习」同时算作业和考试提示）。
- [x] 后端 34 个测试、前端 30 个测试通过；公网页面实测重点提取 + markmap 出图正常。
- [x] 说明：**没有安装 open-notebook**（它是独立 Docker 应用，需要 Postgres），这里只借用它「先结构化出重点、再渲染」的思路。

### M13：测试数据清理与测试隔离修复

- [x] 定位到会话列表出现大量重复测试会话的原因：`tests/test_mindmap.py` 在模块顶层导入 `app.*`，pytest 收集阶段就初始化了 `settings` 和数据库引擎，导致 `client` fixture 里的临时数据库环境变量失效，测试写进了真实 `data/app.db`。
- [x] 修复：`tests/conftest.py` 在导入任何 app 模块之前就设置 `DATA_DIR` / `DATABASE_URL`。
- [x] 验证：连续跑 pytest 后真实数据库会话数保持为 0（修复前每次运行会新增约 20 条）。
- [x] 新增 `session_report.py`（会话数据量报表）与 `reset_test_data.py`（备份 + 回收站式清理）。
- [x] 清空历史测试数据：80 个会话、17 个分片、53 条字幕、28 条标记；数据库已备份，录音目录移到 `data/trash/`。

### M11：手机 / 公网访问

- [x] 公网版前端使用独立构建目录 `.next-public`，不影响本机 dev 实例。
- [x] `/api` 由 Next 反向代理到本机 8000，页面与接口同源，省掉 CORS 和一条隧道。
- [x] `NEXT_PUBLIC_API_BASE_URL=/` 表示同源相对路径，`normalizeApiBaseUrl` 负责解析并带单元测试。
- [x] 一键脚本 `go-online.cmd` → `.tools/go-public.ps1`：起服务、等健康检查、建隧道、构建并启动公网前端、打印手机地址。
- [x] `.tools/tunnels.ps1` 复用仍然可用的隧道，失效时自动重建，地址写入 `data/tunnels.json`。
- [x] `stop-all.ps1` 增加 3001/8002 端口和 cloudflared 进程清理。
- [ ] 把后端 + FunASR 部署到常驻免费平台（Hugging Face Spaces / ModelScope），免去“电脑必须开机”。

### M7：验证与文档

- [x] 完整运行后端测试、前端测试与构建。
- [x] 本地联调录音、上传、合并、标记流程。
- [x] 在 README 写清 10 分钟启动步骤。
- [x] 总结已完成功能、已知限制和下一步建议。

## 状态流转设计

```text
created
  └─> recording        # 第一个分片上传成功
        └─> uploading  # 调用 finalize，开始合并
              ├─> done     # 合并成功
              ├─> pending_batch_transcribe  # 实时转写不可用，等待第二阶段批处理
              └─> failed   # 无分片 / ffmpeg 缺失 / 合并失败

未来扩展：
  done -> transcribing -> analyzing -> done
```

## API 总览

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

### 标记

- `POST /api/sessions/{id}/highlights`
- `GET /api/sessions/{id}/highlights`

### 未来能力占位

- `POST /api/sessions/{id}/transcribe` -> 501
- `POST /api/sessions/{id}/analyze` -> 501
- `GET /api/sessions/{id}/mindmap` -> 501
- `GET /api/sessions/{id}/export` -> 501

### 实时转写

- `WS /ws/sessions/{id}/live-transcribe`
- `GET /api/sessions/{id}/transcript?source=realtime`
- `POST /api/sessions/{id}/transcript`
- `PATCH /api/transcript/segments/{id}`
- `POST /api/sessions/{id}/finalize` 增加字段：`realtime_transcribe_enabled`

### 个性化词库（第一阶段基础 CRUD）

- `GET /api/glossary`
- `POST /api/glossary`
- `DELETE /api/glossary/{id}`

## 验收标准映射

- 能创建听课会话 -> `POST /api/sessions` + 前端新建页。
- 能开始、暂停、继续、停止录音 -> 录音页。
- 能分片上传并合并音频 -> chunks/finalize + ffmpeg。
- 能标记重点、难点、笔记并保存时间戳 -> highlights。
- 开始录音后 1-3 秒内出现实时字幕 -> BrowserWebSpeechProvider / BackendWebSocketASRProvider / MockProvider。
- interim 和 final 字幕样式区分、final 带时间戳并可落库 -> 录音页字幕区和 transcript API。
- 点击字幕跳转到对应音频位置 -> 录音播放器和 transcript 时间戳。
- Provider 失败时录音不中断 -> 实时转写与录音解耦，失败只提示。
- 无 API Key 时可演示 -> MockProvider 明确标记为 mock。
- 停止录音后详情页可查看实时转写 -> `GET /api/sessions/{id}/transcript?source=realtime`。
- 前后端能本地启动 -> README 启动步骤。
- 10 分钟跑通 -> README 快速开始。
