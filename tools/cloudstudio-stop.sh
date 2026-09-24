#!/usr/bin/env bash
# 停掉 Cloud Studio 里启动的前后端进程。
set -uo pipefail

pkill -f "uvicorn space_app:app" 2>/dev/null && echo "已停止后端" || echo "后端未在运行"
pkill -f "next dev" 2>/dev/null && echo "已停止前端" || echo "前端未在运行"
