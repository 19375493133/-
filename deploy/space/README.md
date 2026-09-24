# 路线 2 部署指南：容器跑后端 + Vercel 跑前端

## 一、这个目录解决什么问题

把「后端 API + FunASR 实时转写」合并成**一个进程、一个端口**（7860），
这样只需要一个容器平台就能跑完整后端，前端放 Vercel 就行，
**不再需要你的电脑开着，也不需要 Cloudflare 隧道**。

```
手机/电脑  →  Vercel（Next.js 前端，免费）
                 ├── /api/...  反向代理到 → 容器: /api/...
                 └── wss 直连    → 容器: /funasr/ws/sessions/{id}/live-transcribe
```

| 文件 | 作用 |
| --- | --- |
| `app.py` | 合并入口：加载 backend 的 FastAPI，并把 FunASR 挂在 `/funasr` 下 |
| `Dockerfile` | 镜像定义（python:3.11-slim + ffmpeg + 依赖 + FunASR 模型缓存） |
| `requirements.txt` | 两套依赖合并 |
| `run_local.py` | 本地按容器方式启动，没装 Docker 也能验证 |
| `../../.tools/prepare-space-upload.ps1` | 生成干净的上传目录 `deploy/modelscope-upload/` |

## 二、本地已经验证过（不用 Docker）

```powershell
.\tools\start-space-local.ps1 -Port 7860            # 起合并入口
.\tools\start-public.ps1 -FunasrUrl http://127.0.0.1:7860/funasr `
    -ApiTarget http://127.0.0.1:7860 -DistDir .next-space -Port 3002   # 按同样架构起前端
node .tools\run-space-rounds.mjs http://127.0.0.1:3002 5 12            # 跑 5 轮验收
```

2026-09-20 实测结果：**5/5 轮通过**（录音 → FunASR 实时字幕 3 段/轮 → 合并落库 → 提取重点 → markmap 出图 13 个节点）。

## 三、方式 A：魔搭创空间（国内、免费 CPU，推荐）

1. 打开 <https://www.modelscope.cn/studios>，用魔搭账号登录（需要实名/绑定阿里云）。
2. 点「创建空间」→ 部署类型选 **Docker**（自定义镜像），记下空间名。
3. 生成上传目录：

   ```powershell
   .\tools\prepare-space-upload.ps1
   ```

   得到 `deploy/modelscope-upload/`（约 0.3 MB），里面是：
   ```
   Dockerfile           ← 必须在空间根目录
   requirements.txt
   space_app.py
   backend/
   funasr_backend/
   .dockerignore
   ```
4. 把上面这些文件/目录上传到空间（**不要**上传 `.venv`、`.modelscope`、`data/`，`.dockerignore` 也已经排除）。
5. 在空间的环境变量里加一条（等你有了前端域名再填，先留空也行）：
   ```
   CORS_ORIGINS=https://<你的前端域名>
   ```
6. 等构建完成（首次要装 torch + 下载模型，10-30 分钟），拿到访问域名，例如
   `https://<空间名>.modelscope.space`。自测：
   ```
   https://<空间名>.modelscope.space/api/health          → {"status":"ok"}
   https://<空间名>.modelscope.space/funasr/health       → {"status":"ok","loaded":true}
   ```

## 四、方式 B：Vercel 部署前端（免费）

1. <https://vercel.com> 用 GitHub/邮箱登录 → New Project → 导入本仓库。
2. **Root Directory 选 `frontend`**，框架会自动识别 Next.js。
3. 环境变量（Production + Preview 都加）：

   | 变量 | 值 |
   | --- | --- |
   | `NEXT_PUBLIC_API_BASE_URL` | `/` （用同源相对路径，由 Next 反向代理） |
   | `API_PROXY_TARGET` | `https://<空间名>.modelscope.space` |
   | `NEXT_PUBLIC_FUNASR_API_URL` | `https://<空间名>.modelscope.space/funasr` |

4. Deploy。部署完把 Vercel 域名（形如 `https://xxx.vercel.app`）填回容器的 `CORS_ORIGINS` 并重启容器。
5. 手机打开这个 Vercel 域名即可 —— 这就是要发给你的「手机可登录地址」。

## 五、注意事项

- **数据持久性**：容器里的库文件在 `/data`，平台若不给持久卷，**重启后会话和录音会丢**。
  想保住数据：给空间挂持久存储，或把 SQLite 换成云数据库（后续可改）。
- **冷启动**：免费 CPU 空间闲置会休眠，第一次访问要等 20-60 秒（FunASR 模型加载还要 10-20 秒）。
- **镜像里的模型**：Dockerfile 里有一段「构建时预下载 FunASR 模型」，
  会让镜像大约 +900MB，但冷启动快很多；不想让镜像变大就注释掉那段。
- **WebSocket 必须走容器**：Vercel 的 Serverless 函数不支持长连接，所以实时字幕只能连容器域名。
- **隐私**：录音会上传到云端容器，页面上的隐私提示要保留，必要时征得老师同意。
- **成本**：魔搭免费 CPU 空间有积分/时长限制；量大了会需要付费，先用免费额度测。

## 六、为什么不能由我直接“上架”

创建空间和 Vercel 项目都需要**你的账号登录**（魔搭还要实名）。
我能做的是：把镜像和前端都准备好、在本地按同样的架构跑通测试、写好每一步操作；
真正点“创建/部署”那几下需要你登录（或把对应平台的 Token 给我，我来跑）。
