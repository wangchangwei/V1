#!/bin/bash
set -e

cd /app/my-nextjs-app

# 检查 node_modules 是否存在，不存在则安装
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  bun install
fi

# 启动开发服务器
echo "Starting Next.js dev server..."
exec bun dev
