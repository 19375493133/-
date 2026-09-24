# 用腾讯云 Cloud Studio 部署成网站

> 调研与准备日期：2026-09-21。**代码和脚本都准备好了，但最后"创建空间/登录"必须用你的腾讯云账号**，
> 我这边没有也不该有你的账号权限，所以没有实际部署。

## 一、先说结论

Cloud Studio **能**给出公网 HTTPS 地址，而且**不需要备案域名、不需要你本地电脑开着**——
它的预览地址规则见官方文档（[product/1039/131933](https://cloud.tencent.com/document/product/1039/131933)）：

```
https://${X_IDE_SPACE_KEY}--${PORT}.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}
例：https://5adb8439bf8147658b86f063097fa479--9000.ap-shanghai2.cloudstudio.club
```

**但它是「云端开发环境」，不是「托管平台」**：

- 按 **机时** 计费（官网：每日打卡领取，可累计 2 机时）
- **工作空间停止 → 预览地址失效**；机时用完也会停
- 所以它适合「演示 / 临时给同学用」，**不适合 7×24 常驻**

要长期在线，还是之前那两条：路线 2（后端放云托管/魔搭 + 前端 Vercel）或路线 4（一台云主机）。

## 二、已经准备好的东西

| 文件 | 作用 |
| --- | --- |
| [tools/cloudstudio-start.sh](../tools/cloudstudio-start.sh) | 工作空间里一键启动：建 venv → 装后端+FunASR 依赖 → 装前端依赖 → 起 API(7860) + 前端(3000) → 打印手机地址 |
| [tools/cloudstudio-stop.sh](../tools/cloudstudio-stop.sh) | 停掉前后端 |
| `.tools/pack-for-cloudstudio.ps1` | 打出上传用的干净压缩包 `dist/cloudstudio-package.zip` |
| [deploy/space/app.py](../deploy/space/app.py) | 单进程 = 后端 API + FunASR 实时转写（FunASR 挂在 `/funasr`） |

架构（两个端口，都由 Cloud Studio 直接映射公网）：

```
手机 → https://<key>--3000.<region>.<host>   前端（Next.js）
           └── /api、wss://<key>--7860.<region>.<host>/funasr  直连后端
后端 → https://<key>--7860.<region>.<host>   API + FunASR（同一个进程）
```

后端已通过 `CORS_ORIGINS` 允许前端的预览地址，脚本里会自动带上。

## 三、操作步骤（约 15 分钟，第一次装依赖慢一些）

1. **登录**：用腾讯云账号进入 Cloud Studio（[cloud.tencent.com/product/cloudstudio](https://cloud.tencent.com/product/cloudstudio)），
   完成实名认证（控制台里会引导）。
2. **创建工作空间**：选一个 **CPU 通用模板**（Python 或 Node 基础镜像都行，Ubuntu 环境更省事）。
3. **上传代码**：本机先执行
   ```powershell
   .\tools\pack-for-cloudstudio.ps1
   ```
   得到 `dist\cloudstudio-package.zip`，在工作空间里上传并解压到项目根目录
   （如果工作空间支持 Git，也可以直接把仓库推上去再 clone）。
4. **启动**：在工作空间终端里执行
   ```bash
   bash tools/cloudstudio-start.sh
   ```
   首次会装 torch + funasr（约 3-8 分钟），脚本跑完会打印两个地址。
5. **手机访问**：打开打印出来的 `https://<key>--3000.<region>.<host>`。
   第一次点录音时，后端还在下载/加载 FunASR 模型（1-2 分钟），这期间实时字幕连不上是正常的。
6. **停止**：`bash tools/cloudstudio-stop.sh`；离开时记得在控制台把工作空间关机，省机时。

## 四、已知限制（先说清楚，别踩坑）

1. **地址随工作空间生命周期**：空间一停，`--3000`、`--7860` 两个地址都打不开；重新开机后地址不变（同一个空间），但需要重新跑启动脚本。
2. **机时额度**：免费额度靠每日领取，重度使用会不够；跑 FunASR 的 CPU 推理也吃机时。
3. **数据**：工作空间里的 `data/` 目录随空间存在而保留，但空间被删除就没了；想要长期保存建议定期导出。
4. **两个端口都要能预览**：Cloud Studio 按 `${PORT}` 拼地址，理论上任意端口都可以；如果控制台限制了可预览端口，就把 `WEB_PORT`/`API_PORT` 调成它允许的值再跑脚本。
5. **没做真机验证**：这套脚本是在 Windows 上准备的，我这边没有 Linux/bash 环境，**脚本没有实际在 Cloud Studio 里跑过**；
   逻辑与本地已验证的步骤一致（`deploy/space/app.py` 已本地跑通 5 轮完整链路），但首次运行如果报错，把终端输出发我，我直接改。
