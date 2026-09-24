# 把「大学课堂听课助手」搬到微信小程序：可行性与实施方案

> 本文只做调研与方案设计，**没有做任何上传、注册或发布动作**。
> 所有结论都标注了微信官方文档来源，规则会变，动手前请以官方页面最新内容为准。

## 一、先说结论

微信小程序**不能直接运行现有的 Next.js 页面**（小程序不是浏览器，没有 DOM、没有 `MediaRecorder`、
没有 `AudioWorklet`），所以「把现在的代码传上去」这件事本身不存在。可行的只有三条路：

| 路线 | 做法 | 工作量 | 门槛 |
| --- | --- | --- | --- |
| A. web-view 套壳 | 小程序里放一个全屏 `<web-view>`，加载你现在这个 H5 网址 | 极小（半天） | **个人主体不能用 web-view**，必须企业/组织主体 |
| B. 跨端重写前端（推荐） | 用 Taro 把录音页等页面重写成小程序页面，后端 FastAPI + FunASR 复用 | 中（1-2 周） | 个人主体也能发布 |
| C. 降级成「录音上传 + 服务端转写」 | 不做实时字幕，录完再传 | 小（2-3 天） | 同上 |

关键判断依据（官方原文）：

- [web-view 组件](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html) 明确写着
  「**个人类型的小程序暂不支持使用**」，而且「其它网页需登录小程序管理后台配置业务域名」。
- 小程序页面用 WXML/WXSS 渲染，不能渲染 React 组件、Tailwind 样式、shadcn/Radix 组件。

所以如果你要**个人身份**上线，路线 A 直接排除，只能走 B 或 C。

## 二、决定可行性的 6 个硬限制

### 1. 录音单次最长 10 分钟，且切后台会断

[RecorderManager.start](https://developers.weixin.qq.com/miniprogram/dev/api/media/recorder/RecorderManager.start.html)：

- `duration` 默认 60000ms，**最大值 600000（10 分钟）**；
- `sampleRate` 支持 **16000**（正好是 FunASR 要的采样率）；
- `format` 支持 `mp3 / aac / wav / **PCM**`；
- `frameSize`（分片回调）**暂仅支持 mp3、pcm**。

[运行机制](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/operating-mechanism.html)：
小程序进入后台 **5 秒后 JS 线程挂起**，「事件和接口回调会在再次进入前台时触发」。

这意味着：

- 一节课 45 分钟**不可能一次录完**，必须做「录满 9-10 分钟自动续录」的分段策略；
- 上课期间要提示用户**保持小程序在前台、屏幕常亮**（`wx.setKeepScreenOn`），否则实时字幕会中断；
- 微信语音/视频通话会触发 `onInterruptionBegin`，要处理中断后自动续录。

### 2. 后端域名必须 HTTPS/WSS 且**已 ICP 备案**

[网络能力说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)：

- `wx.request / wx.uploadFile / wx.downloadFile` 只支持 https，`wx.connectSocket` 只支持 wss；
- **域名不能是 IP 或 localhost**，**必须经过 ICP 备案**；
- 不能配置父域名，使用子域名；
- 同一个域名配置了端口就只能用那个端口。

对照现状：我们临时用的 `*.trycloudflare.com` 这类隧道地址**无法**加入「服务器域名」白名单，
所以小程序里那条 FunASR 实时转写通道必须换成下面两种方式之一：

1. **微信云托管**：官方明确写着「如使用微信云托管作为后端服务，则可**无需配置通讯域名**（在小程序内通过
   `callContainer` 和 `connectContainer` 通过微信私有协议发起 HTTPS 调用和 **WebSocket 通信**）」，
   官方还给了 [WebSocket 服务示例](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/scene/deploy/ws-express.html)。
2. **自己在国内买域名 + 备案**，把后端放国内服务器（备案通常要 1-3 周）。

### 3. 本地存储只有 200MB

[文件系统](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/file-system.html)：
本地缓存文件 + 本地用户文件「小程序最多可存储 **200MB**」；本地临时文件运行期最多 4GB，退出后超 2GB 会被清理。

也就是说录音文件要**边录边传**（我们现在的分片上传思路正好用得上），不能指望在手机里存整节课。

### 4. 必须配置「用户隐私保护指引」

[用户隐私保护指引填写说明](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)：
涉及处理用户个人信息的都要填，而且**提审版本实际调用的隐私接口必须和隐私协议内容一致**，
否则提审时会被拦截。我们至少要声明：麦克风、录音、以及「录音会上传到服务器做转写」。

### 5. 类目：个人主体建议选「工具」，教育类目基本走不通

[开放的服务类目](https://developers.weixin.qq.com/miniprogram/product/material/)：

- 个人主体可选类目里有 **工具**，其中 **办公**、**备忘录**、**信息查询** 等**无需额外资质**；
  备忘录类目备注要求「不涉及用户原创内容的传播及公开访问」——我们本地录音笔记、不对外分享，符合。
- **教育服务**下的类目（学历教育、在线视频课程等）要求《民办学校办学许可证》《信息网络传播视听节目许可证》
  之类的资质，个人主体基本无法满足。

建议：定位成「**课堂录音笔记工具**」，选 **工具 → 办公**，不要写「在线教育/课程辅导」。

### 6. 实时字幕的链路要改（这部分我们要重写，但后端不用动）

小程序没有 `MediaRecorder`、没有 `AudioWorklet`，但有 `onFrameRecorded` 回调可以直接拿 **PCM 帧**，
因此链路可以从「AudioWorklet 采 PCM」换成「RecorderManager 直接给 PCM」，FunASR 那边完全不用改。

## 三、现有代码 → 小程序的映射

| 现在（Next.js / H5） | 小程序里对应 |
| --- | --- |
| `MediaRecorder` 录音（webm/opus） | `wx.getRecorderManager()`，`format: 'PCM'`、`sampleRate: 16000`、`numberOfChannels: 1` |
| `AudioWorklet` 采集 16kHz PCM，每 300ms 发帧 | `onFrameRecorded` 直接给 PCM（`frameSize` 设 6KB≈192ms 或 10KB≈320ms） |
| `WebSocket` 连 FunASR 隧道 | `wx.connectSocket`（需备案 wss 域名）或 `wx.cloud.connectContainer`（云托管，免域名白名单） |
| `fetch` 分片上传 30 秒音频 | `wx.uploadFile`（multipart 到同一套 `/api/sessions/{id}/chunks`） |
| `finalize` 合并 | 不变，`wx.request` 调同一个接口 |
| `localStorage` / IndexedDB | `wx.setStorageSync` / `wx.getFileSystemManager()` |
| `<audio>` 播放器 + 点字幕跳转 | `wx.createInnerAudioContext()`，支持 `seek(position)` 和可写 `currentTime` |
| 路由 `app/sessions/[id]/record` | 小程序页面 `pages/record/record?id=xxx`（`app.json` 声明） |
| Tailwind + shadcn/ui 组件 | Taro + NutUI，或原生小程序 + WeUI |
| 后端 FastAPI / SQLite / FunASR | **基本不用改**（SQLite 建议换成云托管自带的 MySQL） |

结论：**要重写的是前端，后端可以整体复用**。

## 四、推荐路线（个人主体，想真正做成小程序）

**阶段 0 · 账号与合规（1-2 天，不写代码）**

1. 到 <https://mp.weixin.qq.com> 注册小程序，主体选个人（或企业），拿到 AppID；
2. 服务类目选 **工具 → 办公**；
3. 填「用户隐私保护指引」：麦克风、录音、录音上传转写、数据仅存本地服务器；
4. 下载「微信开发者工具」，用测试号/开发号跑通 Hello World。

**阶段 1 · 后端上云（2-4 天）**

1. 开通微信云托管，用 Dockerfile 部署 FastAPI 后端（我们仓库里已有 `.dockerignore`/`Dockerfile` 参考写法）；
2. 把 FunASR 服务也做成容器（`paraformer-zh-streaming` 在 CPU 上实测 rtf≈0.37，课堂单路够用），
   用 `connectContainer` 暴露 `/ws/sessions/{id}/live-transcribe`；
3. 数据库换成云托管 MySQL（SQLite 在多实例下不能共享）；
4. 录音文件存云托管对象存储，不再依赖本机磁盘。

> 需要实测的点：FunASR 镜像体积（torch + 模型）在云托管的镜像/实例限制内是否可接受，
> 以及单实例能否稳定跑住 45 分钟长连接。装不下时的退路：只部署后端 API，FunASR 单独放一台轻量服务器。

**阶段 2 · 用 Taro 重写核心页面（3-5 天）**

- 新建 Taro（React）项目，先做 3 个页面：会话列表、新建会话、录音页；
- 录音页要素：计时、波形（用 `canvas` 或简单的音量条）、实时字幕（interim 灰色 / final 黑色）、
  标记重点难点、随想随记输入框；
- 录音策略：`duration: 570000`（9.5 分钟）→ `onStop` 自动续录下一段 → 同时 30 秒切一次上传分片；
- 断线重连：`wx.connectSocket` 的 `onClose` 里重连并回传最近缓冲的 PCM 帧。

**阶段 3 · 补齐功能（3-5 天）**

- 会话详情页 + 字幕列表 + 点击字幕 `seek` 到对应位置；
- 标记 / 随想随记 / 设置页（Provider 选择、词库）；
- 思维导图：小程序里用 `canvas` 自绘，或先用缩进列表代替。

**阶段 4 · 调试与提审（1-3 天 + 审核等待）**

1. 开发者工具 → 真机调试（重点验证：长时间录音、切后台、通话打断、弱网断线重连）；
2. 上传代码 → 提交审核（填类目、截图、隐私指引）→ 发布；
3. 想先给同学试用：不用审核，直接发「体验版」二维码（在后台加体验成员）。

## 五、成本与时间预估

| 项目 | 说明 |
| --- | --- |
| 小程序注册 | 个人免费；企业主体认证 300 元/年 |
| 云托管 | 按量计费（腾讯云 TCB），流量小时几乎为 0；FunASR 常驻会有 CPU 费用 |
| 域名 + 备案 | 若不走云托管则需要，域名几十元/年，备案 1-3 周 |
| 人力 | 路线 B 约 2 周（一个人、边学 Taro 边做） |

## 六、需要真机验证的 5 件事（别只看文档就下结论）

1. `frameSize` 取多大时，FunASR 的 interim 才不卡顿（建议 6-10KB 起步实测）；
2. 华为/小米/iPhone 上 `sampleRate: 16000` + `format: 'PCM'` 是否都生效；
3. 长时间录音（9.5 分钟）自动续录时，前后两段音频拼接是否有断点；
4. 切后台/来电打断后，能否自动恢复到同一条会话；
5. 云托管实例是否能稳定承载 45 分钟的长连接（必要时改成「录完再传」的路线 C）。

## 七、现在的 H5 版本怎么处理

- 已经上线的网页版（Cloudflare 隧道）**继续保留**，电脑和手机浏览器都能用，作为过渡方案；
- 微信内直接打开网页录音**有兼容性风险**（微信内置浏览器对 `getUserMedia` / `MediaRecorder` 的支持历来不稳定），
  真机上要单独测；如果不通，就让用户在系统浏览器（Safari / Chrome）里打开，或直接走小程序；
- 小程序和 H5 可以共用同一套后端 API，做好后是「一套后端、两个前端」。

## 八、几条建议别踩的坑

1. 不要试图把 Next.js 打包进小程序（没有 DOM，跑不起来）；
2. 不要用 `trycloudflare.com` 这类临时域名去做小程序的服务器域名（无法备案、无法过白名单）；
3. 不要把 45 分钟课程设计成「一次录完」（官方硬限制 10 分钟）；
4. 不要在没有隐私指引的情况下提交审核（录音属于隐私接口，会被拦）；
5. 个人主体不要选教育类目（资质要求个人满足不了）。

## 九、结合当前代码：三条「导入小程序」的路径（2026-09-20 更新）

先说结论：**没有"一键把网页导入小程序"的官方工具**。可行的只有下面三条，按落地速度排序。

### 路径 A：web-view 套壳（最快，但要企业主体）

- **做什么**：小程序只放一个页面，里面是全屏 `<web-view src="https://你的H5地址">`，
  H5 就是我们现在这套（Vercel 或隧道地址都行）。
- **前提**（官方文档明确）：
  1. **个人类型的小程序暂不支持使用 web-view** → 必须是**企业/组织主体**；
  2. "其它网页需登录小程序管理后台配置业务域名" → 你的 H5 域名要能配置（**需 ICP 备案**，
     还要能上传域名校验文件；`*.trycloudflare.com`、`*.vercel.app` 这类域名做不到）。
- **风险**：web-view 里的录音走网页的 `getUserMedia`，**微信内置浏览器（尤其 iOS WKWebView）支持不稳定**，
  很可能出现"能打开、点录音没反应"。必须真机验证。
- **适合**：能拿到企业主体 + 有备案域名，且主要想"先能打开看看"的场景。

### 路径 B：Taro 重写前端 + 微信云托管跑后端（推荐，个人主体也能发布）

- **后端**：我们刚做好的 `deploy/space` 容器（**一个容器 = 后端 API + FunASR**）可以直接部署到
  [微信云托管](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/basic/intro.html)。
  官方明确：用云托管时**无需配置通讯域名**，小程序里通过 `callContainer` / **`connectContainer`**
  走微信私有协议调用 HTTPS 和 **WebSocket** —— 也就是说**实时字幕这条路能跑通**，还不用备案域名。
  另外容器内可以直接拿到 `openid`（请求头里自动带），以后要做"每人自己的课堂记录"也很方便。
- **前端**：用 [Taro](https://docs.taro.zone/docs/)（React 语法）重写页面；关键差异：
  | 现在（H5） | 小程序里 |
  | --- | --- |
  | `MediaRecorder` 录 webm | `wx.getRecorderManager()`，`format: 'PCM'`、`sampleRate: 16000`、`frameSize` |
  | `AudioWorklet` 每 300ms 发 PCM | `onFrameRecorded` 直接给 PCM 帧 → `connectContainer` 发过去 |
  | `fetch` 上传分片 | `wx.uploadFile` |
  | `localStorage` / IndexedDB | `wx.setStorageSync` / `FileSystemManager` |
  | `<audio>` 跳转 | `wx.createInnerAudioContext()`（支持 `seek`） |
- **主体与类目**：个人主体选 **工具 → 办公**（无需额外资质），别选教育类目。
- **工作量**：1-2 周（前端重写为主，后端容器基本现成）。
- **硬限制**（官方）：录音单次最长 **10 分钟**、切后台 5 秒后 JS 挂起 →
  45 分钟的课必须做「录满 9.5 分钟自动续录 + 保持屏幕常亮」。

### 路径 C：kbone 同构（尽量复用现有 React 代码）

- [Tencent/kbone](https://github.com/Tencent/kbone)（4.9k★，2025-10 仍有更新）是腾讯开源的
  「Web 与小程序同构」方案，可以让 Web 框架代码跑在小程序里。
- **但要清楚**：录音相关的浏览器 API（`MediaRecorder`、`AudioWorklet`）在小程序里**不存在**，
  这部分照样得换成 `wx.getRecorderManager()`；kbone 的兼容坑比 Taro 多，社区也小。
- **适合**：重写成本实在无法接受、又愿意啃兼容问题的场景。

### 三条路径对比

| | A. web-view 套壳 | B. Taro + 云托管 | C. kbone 同构 |
| --- | --- | --- | --- |
| 主体要求 | **必须企业/组织** | 个人可以 | 个人可以 |
| 域名要求 | 必须 ICP 备案 | **免配置域名**（云托管） | 视后端部署方式 |
| 实时字幕能否用 | ⚠️ 依赖 WebView 录音，风险高 | ✅ `connectContainer` 支持 WebSocket | ⚠️ 需要自己适配 |
| 工作量 | 半天 | 1-2 周 | 3-7 天但坑多 |
| 代码复用 | 100%（网页原样） | 后端复用，前端重写 | 前端大部分复用 |

### 我的建议

1. **想最快验证"小程序里能不能用"** → 先看你的小程序主体是不是企业；
   是就走 A（半天），不是就走 B。
2. **想真正做完、个人主体也能上线** → 走 **B**：后端用我们已经准备好的 `deploy/space` 容器
   部署到微信云托管，前端用 Taro 重写录音页 + 实时字幕 + 会话列表。
3. **C 只在"完全不想重写前端"时才考虑**。

> 注意：本节只做方案梳理，**没有创建小程序、没有上传代码、没有配置任何域名**。
