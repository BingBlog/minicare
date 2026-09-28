#!/usr/bin/env bash
# 双端编译冒烟（CI 用）：同时验证 weapp 与 h5 两个编译目标可构建成功
#
# ⚠️ 本地运行注意：weapp 构建会覆盖 dist/（微信开发者工具 watch 的目录），
#    本地运行前请先关闭开发者工具或确认没有 dev:weapp watch 进程。
#    H5 产物输出到 dist-h5/，与 weapp 互不影响。
#
# 用法：bash scripts/build-all.sh   （需 Node 18：.nvmrc）
set -e
cd "$(dirname "$0")/.."

echo "==> [1/2] build:weapp"
npm run build:weapp

echo "==> [2/2] build:h5"
npm run build:h5

echo "==> 双端编译冒烟通过"
