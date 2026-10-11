#!/usr/bin/env bash
# 组装 Taro H5 部署产物（minicare-mp → CloudBase 静态托管）
#
# 用法：
#   bash scripts/prepare-h5-deploy.sh prod      # 生产：构建 + 注入过渡文件（部署到托管根 /）
#   bash scripts/prepare-h5-deploy.sh staging   # staging：构建 + 注入过渡文件（部署到 /staging/）
#
# 产物：dist-h5/（index.html、js/、css/、sw.js[自注销版]、version.json[部署时间]）
# 上传（二选一；tcb CLI 需本机已登录，或走 CloudBase MCP manageHosting upload）：
#   tcb hosting deploy dist-h5 . -e minicare-cloud-6gqledlle0132cbe --safe        # prod
#   tcb hosting deploy dist-h5 staging -e minicare-cloud-6gqledlle0132cbe --safe  # staging
#
# 注意：staging 依赖 .env.staging 的 TARO_APP_H5_BASE_PATH=/staging/（产物资源带 /staging/ 前缀）。
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
case "$TARGET" in
  prod)    BUILD_CMD="npm run build:h5" ;;
  staging) BUILD_CMD="npm run build:h5:staging" ;;
  *) echo "用法: bash scripts/prepare-h5-deploy.sh prod|staging"; exit 1 ;;
esac

echo "==> [1/3] 构建（${TARGET}）"
$BUILD_CMD

[ -f dist-h5/index.html ] || { echo "✖ 构建产物缺失：dist-h5/index.html"; exit 1; }

echo "==> [2/3] 注入过渡文件（sw.js 自注销版 / version.json）"
cp scripts/hosting/sw-unregister.js dist-h5/sw.js
node -e 'const fs=require("fs");fs.writeFileSync("dist-h5/version.json",JSON.stringify({buildTime:new Date().toISOString()}))'

echo "==> [3/3] 产物自检（校验 index.html 引用的资源均存在于 dist-h5）"
node -e '
const fs=require("fs");
const html=fs.readFileSync("dist-h5/index.html","utf8");
const refs=[...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m=>m[1]))];
const miss=refs.filter((r)=>!fs.existsSync("dist-h5/"+r.replace(/^\//,"").replace(/^staging\//,"")));
if(miss.length){console.error("✖ 缺失资源:",miss);process.exit(1)}
console.log("✔ 引用自检通过（"+refs.length+" 个资源）");
'

echo "==> 完成：dist-h5 就绪（目标路径 $([ "${TARGET}" = "staging" ] && echo '/staging/' || echo '/')）"
