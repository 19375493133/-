# 开源免费「文字转思维导图」工具调研

> 调研日期：2026-09-19。星标 / 许可证 / 最后提交时间来自 GitHub API 实时查询，
> “在线可用性”是对官网做过实际请求验证（全部返回 200）。规则和项目状态会变，动手前请以项目主页为准。

## 一、先看结论

按用途分成三类，我们对号入座：

| 你的需求 | 首选 | 备选 |
| --- | --- | --- |
| 想**马上用**，把一段文字/一篇文章丢进去出导图 | [Ai-Markmap](#ai-文字转思维导图)（单文件 HTML，接自己的 API Key） | [markmap REPL](https://markmap.js.org/repl)、[Drawnix](https://drawnix.com/)、[mermaid.live](https://mermaid.live/) |
| 想把导图**嵌进自己的网站/项目** | [markmap](#1-markmapmarkmap推荐的嵌入方案)（MIT，npm 直接装） | simple-mind-map（功能最全）、mind-elixir（最轻） |
| 想要**桌面离线**、不联网 | [Freeplane](https://www.freeplane.org/)（GPL-2.0） | Heimer（Qt，GPL-3.0） |
| 要给**AI Agent / MCP 客户端**用 | markmap-mcp-server（MIT） | mindmap-mcp-server（MIT） |

对我们这个项目（课堂录音 → 转写 → 导图），最省事的组合是：
**让 LLM 输出 Markdown 大纲 → 前端用 markmap 渲染 → 需要导出/编辑再换 simple-mind-map**。

## 二、可以直接用的在线工具（免费、开源、已验证可访问）

| 工具 | 星标 | 许可证 | 最后提交 | 特点 | 官网 |
| --- | --- | --- | --- | --- | --- |
| **markmap** | 13.1k | MIT | 2026-09-12 | Markdown → 可折叠交互导图；有在线 REPL、CLI、VS Code 插件 | <https://markmap.js.org/repl> |
| **Simple mind map（思绪思维导图）** | 12.7k | MIT | 2026-08-02 | 中文界面；开源版支持导入 json/xmind/markdown、导出 json/png/svg/pdf/markdown/xmind/txt；多种结构（逻辑结构、时间轴、鱼骨图等） | <https://web.sxmind.cn/> |
| **Drawnix** | 14.7k | MIT | 2026-09-08 | 一体化白板（导图+流程图+自由画），**新支持 markdown 文本转思维导图**，可 Docker 自部署，导出 PNG/JSON | <https://drawnix.com/> |
| **Mermaid Live** | 90.3k（mermaid 主仓） | MIT | 2026-09-18 | 用文本描述画图，10.0 起支持 `mindmap` 语法（官方标注实验性，语法已稳定） | <https://mermaid.live/> |

## 三、能嵌进项目的开源库（重点）

### 1. markmap/markmap（推荐的嵌入方案）

- 许可证 **MIT**，13.1k stars，最近仍在更新（2026-09-12）。
- 输入就是普通 **Markdown**（`#` 标题层级 = 节点层级），输出可折叠、可缩放、可交互的导图。
- 提供 `markmap-lib` / `markmap-view`（浏览器直接引）/ `markmap-cli` / `markmap-render` / VS Code 插件。
- **注意**：官方 CLI 的输出格式只有 **HTML**（`-o, --output` 的说明就是 "filename of the output HTML"）。
  页面里渲染出来的本来就是 SVG，要导出 PNG/SVG 需要自己序列化那份 SVG DOM（十几行代码），
  或者改用自带导出插件的 simple-mind-map。
- 生态成熟：VS Code、Vim/Neovim、Emacs、MCP Server 都有现成适配。
- 最适合我们：后端只要产出 Markdown，前端一行 `import { Markmap } from "markmap-view"` 就能渲染。

### 2. wanglin2/mind-map（simple-mind-map，功能最全）

- 许可证 **MIT**，12.7k stars。核心是**不依赖任何框架的 JS 库**，另有 Vue2 写的 Web 版可自部署。
- 开源版（本仓库）能力：**导入 json / xmind / markdown**，**导出 json / png / svg / pdf / markdown / xmind / txt**；
  结构支持逻辑结构图、思维导图、组织结构图、目录组织图、时间轴、鱼骨图。
- 许可证 MIT，「保留版权声明和注明来源的情况下可随意商用」。
- 注意：README 明确写**库和 Web 版已进入低维护状态**（作者精力转向闭源客户端）；
  FreeMind / Mermaid / Xlsx 的导入导出、AI 生成主题、客户端软件属于**闭源商业产品**，不在开源范围内。

### 3. 其他可选库

| 库 | 星标 | 许可证 | 定位 |
| --- | --- | --- | --- |
| **mind-elixir-core** | 3.2k | MIT | 轻量、框架无关、API 简单，适合快速嵌一个可编辑导图 |
| **jsMind** | 3.8k | BSD（README 注明） | 老牌 canvas + svg 库，静态展示 + 编辑，文档全中文 |
| **kityminder-core** | 1.4k | BSD-3-Clause | 百度脑图的内核，功能强但最后提交 2024-03，社区已冷 |
| **Mermaid** | 90.3k | MIT | 文本 → 图（含 `mindmap`），适合已经在用 Mermaid 的项目 |
| **PlantUML** | 13.3k | LGPL-3.0 | `@startmindmap` 语法，服务端渲染，适合企业文档流 |

## 四、AI 文字转思维导图

这类是「粘贴一段长文 → AI 提炼 → 出导图」，和我们的课堂转写场景最接近：

| 项目 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| **Ai-Markmap** | 440 | MIT | **单个 HTML 文件、零依赖、纯前端**；粘贴文本 → 调任意 OpenAI 兼容接口（可接自托管模型）→ 出可交互导图；支持自定义 Prompt、一次生成多版本、导出高清 PNG/SVG、中英双语、移动端适配。**个人马上能用的首选**。 |
| **DeepDiagram** | 924 | AGPL-3.0 | 自然语言 → 思维导图 / Mermaid / ECharts。功能强，但 **AGPL 有传染性**，要集成进闭源产品需谨慎。 |
| **Mind-Map-Wizard** | 356 | 自定义（NOASSERTION） | 浏览器里的简易 AI 导图，适合做研究笔记 |
| **markmap-mcp-server** | 287 | MIT | MCP 服务，让 Claude / Cursor 等直接产出 markmap |
| **mindmap-mcp-server** | 239 | MIT | 同上，另一实现 |
| **Yank Note (yn)** | 6.8k | AGPL-3.0 | Markdown 笔记软件，内置 markmap 思维导图、AI Copilot、版本控制 |

## 五、桌面离线工具

| 工具 | 星标 | 许可证 | 说明 |
| --- | --- | --- | --- |
| **Freeplane** | 4.4k | GPL-2.0 | Java 桌面导图，功能非常全，可导入 OPML/Markdown 大纲，离线可用，仍在活跃更新（2026-09-18） |
| **Heimer** | 976 | GPL-3.0 | Qt 写的小巧导图/笔记工具，跨平台 |
| FreeMind / VYM | — | GPL-2.0 | 更老牌的桌面导图，GitHub 主仓已不活跃，多托管在 SourceForge |

## 六、对我们项目的落地建议

1. **短期（不装新库）**：现在录音页的「实时思维导图」是我们自己写的树组件，先保留，够用。
2. **中期（推荐）**：把「关键词堆叠」升级成 **markmap + LLM 输出的 Markdown 大纲**：
   - 后端新增一个 `/api/sessions/{id}/mindmap` 返回 Markdown（沿用现有占位接口）；
   - 前端用 `markmap-view` 渲染，天然支持折叠/缩放（渲染结果本身就是 SVG DOM）；
   - 节点里可以带上「时间点/原句」，需要点击跳转时再挂一层自定义事件。
   - 要导出 PNG/SVG 时，自己把那份 SVG DOM 序列化下载即可（markmap 官方 CLI 只输出 HTML）。
3. **如果要「可编辑 + 多格式导出」**：换 **simple-mind-map**，导出 PNG/SVG/PDF/XMind/Markdown 开箱即用，
   代价是库偏大、上游进入低维护状态。
4. **如果只想自己快速整理课堂文字**：直接用 **Ai-Markmap**（本地打开 HTML，填 API Key，粘贴转写文本）。
5. **许可证提醒**：MIT/BSD 的（markmap、simple-mind-map、mind-elixir、jsMind、Mermaid、Drawnix）可以放心商用集成；
   GPL/AGPL 的（Freeplane、DeepDiagram、Yank Note）集成前要评估开源义务。

## 七、验证方式

- GitHub API 实时查询：`stargazers_count`、`license.spdx_id`、`pushed_at`、`archived`；
- 官网可用性实测：markmap.js.org、web.sxmind.cn、drawnix.com、freeplane.org、mermaid.live 均返回 HTTP 200；
- 各项目 README 原文用于确认「是否支持 Markdown / 导出格式 / 是否开源」。
