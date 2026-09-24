# 像「听脑 AI」那样把讲课转成重点 + 思维导图：开源项目调研

> 调研日期：2026-09-19。星标 / 许可证 / 最后提交时间来自 GitHub API 实时查询。
> **本轮只做调研，没有给本项目安装任何依赖、没有改任何代码。**

## 一、先把「听脑 AI」拆开看

听脑这类产品实际是 4 段流水线，开源界的成熟度差别很大：

| 环节 | 开源成熟度 | 代表项目 |
| --- | --- | --- |
| ① 录音 → 文字（含说话人区分） | ✅ 非常成熟 | Meetily、Scriberr、Buzz、Vibe、FunClip、RealtimeSTT |
| ② 文字 → 摘要 / 重点 / 待办 | ✅ 成熟 | Meetily、anarlog、Scriberr、open-notebook |
| ③ 重点 → 思维导图 | ⚠️ 基本没有成品，靠库自己接 | Ai-Markmap、markmap、DeepDiagram |
| ④ 导出（Markdown/PDF/图） | ⚠️ 多数是付费点 | Meetily PRO、anarlog 企业版 |

结论：**「转写 + 重点摘要」有很成熟的开源替代；「自动出思维导图」这一段在开源界几乎是空白**，
现有项目要么只给 Markdown，要么要你自己接一个渲染库（也是我们现在这个项目的做法）。

## 二、一体化助手（最接近听脑的成品）

| 项目 | 星标 | 许可证 | 最后更新 | 说明 |
| --- | --- | --- | --- | --- |
| [Zackriya-Solutions/meetily](https://github.com/Zackriya-Solutions/meetily) | 30.9k | MIT（社区版） | 2026-09-15 | **最接近听脑**。Rust 写的本地会议助手：Whisper / Parakeet 实时转写、说话人区分、Ollama / Claude / Groq / OpenRouter / 任意 OpenAI 兼容接口生成摘要。100% 本地，Windows + macOS。注意：导出、高级摘要、团队功能在付费 PRO 版 |
| [fastrepl/anarlog](https://github.com/fastrepl/anarlog)（原 hyprnote） | 9.3k | MIT（社区版） | 2026-09-19 | 自称「开源版 Granola」：不派机器人入会，直接听设备音频，本地 SQLite 存会话/笔记/转写，可导出 Markdown，模型可换本地或自带 Key。企业组件商业授权 |
| [rishikanthc/Scriberr](https://github.com/rishikanthc/Scriberr) | 3.1k | MIT | 2026-06-01 | 自托管网页版：WhisperX / Parakeet / Canary，说话人分离，**可以跟你的转写对话**、生成摘要 |
| [thepersonalaicompany/amurex](https://github.com/thepersonalaicompany/amurex) | 2.9k | AGPL-3.0 | 2025-05-27 | AI 会议 copilot，功能全但**已一年多没更新**，AGPL 有传染性 |
| [Natively（natively-cluely-ai-assistant）](https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant) | 2.6k | 自定义（NOASSERTION） | 2026-09-18 | 实时转写 + 会议笔记 + 本地 RAG + 自带 Key，主打「Cluely/Otter/Granola 的免费替代」；许可证需自行确认 |
| [open-software-network/os-clovy](https://github.com/open-software-network/os-clovy) | 356 | MIT | 2026-09-14 | Mac 上的本地 AI 工作台：聊天 + 听写 + 会议笔记，Rust |

## 三、中文 / 课堂场景（跟你这个项目最像）

| 项目 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| [modelscope/FunClip](https://github.com/modelscope/FunClip) | 6.3k | MIT | 阿里 FunASR 官方周边：**中文转写 + 字幕 + LLM 辅助**，本地 Gradio 界面。中文场景最贴，但定位是「视频剪辑」而不是课堂笔记 |
| [QwenAudio/SenseVoice](https://github.com/QwenAudio/SenseVoice) | 9.3k | MIT | 中文/粤语/英/日/韩 ASR 模型（我们项目用的 FunASR 就是这一脉） |
| [joeseesun/qiaomu-anything-to-notebooklm](https://github.com/joeseesun/qiaomu-anything-to-notebooklm) | 6.1k | MIT | Claude Skill：微信文章/网页/YouTube/PDF → 播客 / PPT / **MindMap** / 测验，中文作者，偏「内容加工」 |
| [LibKelly/kesheng（课声）](https://github.com/LibKelly/kesheng) | 0 | 未标注 | 个人项目，纯前端本地课堂录音 + 浏览器 SpeechRecognition 实时转写 + 自动整理重点，可导出 Markdown。**思路和我们几乎一样**，但依赖浏览器识别、无后端 |
| [byggg1/LectureScribe](https://github.com/byggg1/LectureScribe) | 0 | 未标注 | iOS 原生课堂笔记 App（Swift）：AVAudioEngine 录音 + SFSpeechRecognizer 流式转写（每 50 秒轮换任务绕开时长上限）+ AI 四档重要度判定。**它的「实时总结输出概述/要点/术语/作业待办」很值得抄思路** |
| [Yiheng-guo/class-notes-assistant](https://github.com/Yiheng-guo/class-notes-assistant) | 0 | 未标注 | 课堂笔记整理 Skill：转写文本 → 带高亮的结构化笔记 |
| [itingnao/tingnao-cli-skills](https://github.com/itingnao/tingnao-cli-skills) | 3 | MIT-0 | 听脑官方 CLI。之前评估过：上传文件 → 云端异步任务 → 轮询结果，**不支持流式/实时** |

## 四、转写引擎与实时流式（自己搭的话选这些）

| 项目 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| [chidiwilliams/buzz](https://github.com/chidiwilliams/buzz) | 21.6k | MIT | 桌面离线转写 + 翻译，Whisper |
| [KoljaB/RealtimeSTT](https://github.com/KoljaB/RealtimeSTT) | 10.1k | MIT | 低延迟流式转写库，内置 VAD 和唤醒词，适合做「边说边出字」 |
| [thewh1teagle/vibe](https://github.com/thewh1teagle/vibe) | 7.5k | MIT | 跨平台离线转写桌面应用 |
| [FunASR](https://github.com/modelscope/FunASR) / SenseVoice | — | MIT | 中文识别主力，我们已经在用 |

## 五、文字 → 重点 / 结构化（"NotebookLM 开源替代"这一类）

| 项目 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook) | 39.2k | MIT | 开源 NotebookLM：把资料丢进去 → 摘要、问答、播客，**结构化程度高** |
| [khoj-ai/khoj](https://github.com/khoj-ai/khoj) | 37.4k | AGPL-3.0 | 自托管「第二大脑」，可接本地模型做检索问答 |
| [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) | 72.8k | 自定义（NOASSERTION） | 开源版 Notion + Miro，白板里能画脑图，带 AI。适合当「笔记载体」而不是自动出图 |
| [reorproject/reor](https://github.com/reorproject/reor) | 8.6k | AGPL-3.0 | 本地 AI 笔记，自动建立笔记间关联（最后更新 2025-05，已放缓） |

## 六、文字 → 思维导图（这段开源界最薄）

详细横评见本仓库 [MINDMAP_TOOLS.md](MINDMAP_TOOLS.md)，这里只列能和「重点整理」衔接的：

| 项目 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| [kongkongyo/Ai-Markmap](https://github.com/kongkongyo/Ai-Markmap) | 440 | MIT | 单文件 HTML，粘贴长文 → 调任意 OpenAI 兼容接口 → 出可交互导图，可导出 PNG/SVG |
| [LingyiChen-AI/DeepDiagram](https://github.com/LingyiChen-AI/DeepDiagram) | 924 | AGPL-3.0 | 自然语言 → 思维导图 / Mermaid / ECharts |
| [markmap/markmap](https://github.com/markmap/markmap) | 13.1k | MIT | Markdown → 导图的渲染库（我们项目现在用的就是它） |
| [plait-board/drawnix](https://github.com/plait-board/drawnix) | 14.7k | MIT | 开源白板，支持 markdown 文本转思维导图，可 Docker 自部署 |
| [marpalo/whisper-mindmap-tools](https://github.com/marpalo/whisper-mindmap-tools) | 0 | 未标注 | 播客转写 → Excalidraw 思维导图的脚本，思路可直接参考 |

## 七、如果只是自己用，我建议这样选

| 你的场景 | 建议 |
| --- | --- |
| 想要一个「装上就能用」的听脑替代 | **Meetily**（Windows/macOS，本地，Ollama 摘要，MIT 社区版） |
| Mac 用户、想要 Granola 那种轻量体验 | **anarlog**（原 hyprnote） |
| 想对着录音提问、找重点 | **Scriberr**（自托管网页版，可跟转写对话） |
| 中文课堂 + 想要重点和字幕 | **FunClip**（FunASR 官方周边，中文最稳） |
| 想要「重点 → 思维导图」 | 开源没有成品，**open-notebook 出重点 + Ai-Markmap/markmap 出图** 是最省事的组合 |
| 想要和我们这个项目一样的「课堂 + 实时字幕 + 导图」 | 目前只有 `kesheng`、`LectureScribe` 这类 0 星个人项目，功能都比我们现在的实现少 |

## 八、许可证提醒

- **MIT / BSD**：Meetily 社区版、anarlog 社区版、Scriberr、Buzz、Vibe、FunClip、Ai-Markmap、markmap、Drawnix —— 可以放心参考甚至商用。
- **AGPL-3.0**：amurex、Khoj、Reor、DeepDiagram —— 集成进闭源产品有开源义务，谨慎。
- **商业版边界**：Meetily PRO（导出/高级摘要/团队）、anarlog 企业组件是闭源商业部分；
  AFFiNE、Natively 的许可证标注为 NOASSERTION（自定义），商用前要自己读一遍。

## 九、验证方式

- GitHub API：`stargazers_count`、`license.spdx_id`、`pushed_at`、仓库描述；
- 逐个读 README 原文确认能力（本地/云端、支持的模型、是否含摘要、是否含导图）；
- 搜索关键词覆盖：meeting minutes / AI meeting notes / lecture notes / 会议纪要 / 课堂转写 / mindmap summary / notebooklm open source 等。

> 再次说明：以上项目**都没有安装到本机或本项目**，本文只是选型参考。
