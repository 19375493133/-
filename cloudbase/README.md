# 聆听 · 微信云开发（云函数 + 云数据库）

环境 ID：`cloud1-d9g8ggp3eba5ba3c0`　应用：`且停行 / wx9cb9eb6d646e8d71`（免费开发环境）

## 一、这两个云函数是干什么的

| 云函数 | 作用 |
| --- | --- |
| `api` | **请求转发**。小程序用 `wx.cloud.callFunction` 调它，它再转给后端容器。因为小程序 ↔ 云函数走微信内网，**不需要在小程序后台配置任何服务器域名，也不需要备案**。 |
| `initdb` | **初始化云数据库**。创建 `sessions`、`transcripts`、`notes`、`_meta` 四个集合，并写入一条结构版本记录。 |

## 二、部署（两步）

### 第 1 步：登录一次（必须你来，我没有你的账号）

```powershell
cd G:\文挡\ChatGPT\大学课堂听课助手\cloudbase
..\ .tools\cloudbase\node_modules\.bin\tcb.cmd login
```

> 上面路径写全一点：
> ```powershell
> & "G:\文挡\ChatGPT\大学课堂听课助手\.tools\cloudbase\node_modules\.bin\tcb.cmd" login
> ```

会弹出浏览器/二维码，用**小程序管理员微信**扫码即可。登录状态会保存在本机，
之后我就能直接帮你部署。

如果没法扫码，也可以用腾讯云 API 密钥（云开发控制台可获取 SecretId/SecretKey）：

```powershell
& "...\tcb.cmd" login --apiKeyId <SecretId> --apiKey <SecretKey>
```

### 第 2 步：一键部署

```powershell
.\cloudbase\deploy.ps1 -BackendBaseUrl "https://你的后端容器地址"
```

它会依次：检查登录 → 部署 `api` → 部署 `initdb` → 调用 `initdb` 建好数据库集合。

## 三、云数据库集合设计

| 集合 | 用途 | 主要字段 |
| --- | --- | --- |
| `sessions` | 听课/会议会话 | `_openid`、`title`、`course`、`teacher`、`date`、`status`、`duration`、`backendSessionId`、`createdAt` |
| `transcripts` | 转写字幕 | `_openid`、`sessionId`、`text`、`startSeconds`、`endSeconds`、`speaker`、`source` |
| `notes` | 重点 / 难点 / 问题 / 笔记 | `_openid`、`sessionId`、`type`、`content`、`timestampSeconds` |
| `_meta` | 结构版本信息 | `key`、`version`、`collections`、`createdAt` |

> 云开发会自动按 `_openid` 做数据隔离：每个用户只能读写自己的记录，
> 不需要额外写权限规则（默认权限「仅创建者可读写」即可）。

## 四、为什么后端不放在云函数里

我们的后端是 **FastAPI + FunASR 容器**，需要：

- 加载 torch 和 900MB 的语音模型（内存几 GB）
- 常驻进程 + **WebSocket 长连接**（实时字幕）
- 容器里跑 ffmpeg 合并音频

云函数是「一次性执行、按次计费、有内存/时长上限」的形态，**装不下也跑不动**语音模型，
而且**不支持 WebSocket**。所以：

- **云函数**：只做转发和轻量逻辑（免域名、免备案）
- **容器（云托管 / ModelScope / 自己的服务器）**：跑真正的识别与分析

## 五、小程序侧怎么用

「聆听」小程序里已经有三种连接方式（设置页可切换）：

| 方式 | 说明 |
| --- | --- |
| `cloudfn` | **走这次部署的云函数**，完全免域名（REST 接口可用；实时字幕受限，见下） |
| `cloud` | 走微信云托管 `callContainer` / `connectContainer`（含实时字幕） |
| `custom` | 自建域名，需要配置服务器域名白名单 |

> 说明：云函数不支持 WebSocket，所以 `cloudfn` 模式下**实时字幕需要搭配云托管或自建 wss 域名**；
> 会话管理、重点提取、思维导图大纲这些 HTTP 能力都可以正常用。
