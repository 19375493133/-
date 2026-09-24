#!/usr/bin/env bash
# 在腾讯云 Cloud Studio 工作空间里一键启动「聆听/课堂听课助手」全栈。
#
# 用法（在工作空间终端里）：
#     bash tools/cloudstudio-start.sh
#
# 它会做四件事：
#   1. 建一个 Python venv，装后端 + FunASR 依赖（deploy/space/requirements.txt）
#   2. 装前端依赖（pnpm，没有就走 npm）
#   3. 用 deploy/space/app.py 启动「API + 实时转写」单进程（0.0.0.0:7860）
#   4. 启动前端（0.0.0.0:3000），并把两个公网预览地址打印出来
#
# Cloud Studio 的预览地址规则（官方文档 product/1039/131933）：
#   https://${X_IDE_SPACE_KEY}--${PORT}.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}
# 注意：服务必须监听 0.0.0.0，端口必须与地址里的端口一致。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
mkdir -p "$REPO_ROOT/data/logs"

API_PORT="${API_PORT:-7860}"
WEB_PORT="${WEB_PORT:-3000}"
VENV_DIR="$REPO_ROOT/.venv-space"

preview_url() {
  local port="$1"
  if [[ -n "${X_IDE_SPACE_KEY:-}" && -n "${X_IDE_SPACE_REGION:-}" && -n "${X_IDE_SPACE_HOST:-}" ]]; then
    echo "https://${X_IDE_SPACE_KEY}--${port}.${X_IDE_SPACE_REGION}.${X_IDE_SPACE_HOST}"
  else
    echo "http://127.0.0.1:${port}（未检测到 Cloud Studio 环境变量，用本机地址）"
  fi
}

API_URL="$(preview_url "$API_PORT")"
WEB_URL="$(preview_url "$WEB_PORT")"

echo "=============================================="
echo " 手机访问地址（跑起来后用这个）"
echo "   网页版： $WEB_URL"
echo "   后端API： $API_URL"
echo "=============================================="

# ---------- 1. 后端（API + FunASR 单进程） ----------
if [[ ! -d "$VENV_DIR" ]]; then
  echo "[1/4] 创建 Python 环境并安装依赖（首次约 3-8 分钟，torch 比较大）..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r deploy/space/requirements.txt

# 容器里是把 app.py 复制成 space_app.py 再启动的，这里保持一致（避免 app 包名冲突）
cp deploy/space/app.py "$REPO_ROOT/space_app.py"

export DATA_DIR="${DATA_DIR:-$REPO_ROOT/data}"
export CORS_ORIGINS="${CORS_ORIGINS:-$WEB_URL,http://localhost:${WEB_PORT}}"
export MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-$REPO_ROOT/funasr_backend/.modelscope}"

echo "[2/4] 启动后端（API + FunASR，端口 ${API_PORT}）..."
pkill -f "uvicorn space_app:app" 2>/dev/null || true
nohup python -m uvicorn space_app:app \
  --host 0.0.0.0 --port "$API_PORT" \
  >"$REPO_ROOT/data/logs/cloudstudio-api.log" 2>&1 &
echo "     日志： data/logs/cloudstudio-api.log"

# ---------- 2. 前端 ----------
echo "[3/4] 安装并启动前端（端口 ${WEB_PORT}）..."
cd "$REPO_ROOT/frontend"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --silent
  RUNNER="pnpm"
else
  npm install --silent
  RUNNER="npm"
fi

pkill -f "next dev" 2>/dev/null || true
NEXT_PUBLIC_API_BASE_URL="$API_URL" \
NEXT_PUBLIC_FUNASR_API_URL="$API_URL/funasr" \
nohup "$RUNNER" dev --hostname 0.0.0.0 --port "$WEB_PORT" \
  >"$REPO_ROOT/data/logs/cloudstudio-web.log" 2>&1 &
echo "     日志： data/logs/cloudstudio-web.log"

# ---------- 3. 等待就绪 ----------
echo "[4/4] 等待服务就绪..."
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    echo "     后端就绪"
    break
  fi
  sleep 2
done
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
    echo "     前端就绪"
    break
  fi
  sleep 2
done

echo
echo "=============================================="
echo " 搞定了，手机浏览器打开这个地址即可："
echo "   $WEB_URL"
echo
echo " 提示："
echo "   - Cloud Studio 按「机时」计费，工作空间停止后该地址会失效；"
echo "   - 首次跑的时候 FunASR 模型要下载/加载（约 1-2 分钟），这期间实时字幕会连不上；"
echo "   - 停止服务： bash tools/cloudstudio-stop.sh"
echo "=============================================="
