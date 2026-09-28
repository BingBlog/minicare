#!/usr/bin/env bash
# =============================================================
# deploy.sh — 后端部署前预检脚本
#
# 职责（仅预检，不执行上传/部署）：
#   1. 清理项目根目录下的 code*.zip 残留
#   2. 检查 dist/ 大小和内容是否异常（警告/阻止）
#
# 实际部署由 CloudBase CLI (tcb) 负责：
#   - 命令：tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe
#   - 需先登录：tcb login
#
# 用法:
#   npm run deploy            # 推荐入口（build → 预检）
#   bash scripts/deploy.sh   # 仅运行预检
#   bash scripts/deploy.sh --check  # 同上（兼容旧用法）
# =============================================================

set -euo pipefail

# ── 颜色输出 ─────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ ${NC}$*"; }
success() { echo -e "${GREEN}✓ ${NC}$*"; }
warn()    { echo -e "${YELLOW}⚠ ${NC}$*"; }
error()   { echo -e "${RED}✗ ${NC}$*" >&2; }
step()    { echo -e "\n${BOLD}── $* ──${NC}"; }

# ── 解析参数（兼容旧 --check / --env 用法）───────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--env)
      shift
      [[ $# -gt 0 && "$1" != --* ]] && shift
      ;;
    *)
      shift
      ;;
  esac
done

# ── 项目根目录 ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

# 阈值配置
DIST_SIZE_WARN_KB=2000       # dist/ 2 MB 警告
DIST_SIZE_HARD_LIMIT_KB=5000 # dist/ 5 MB 阻止

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   minicare-server 构建预检                   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# Step 1：清理 code*.zip 残留
# ══════════════════════════════════════════════════════════════
step "Step 1  清理 code*.zip 残留"

STALE_ZIPS=$(find "${PROJECT_DIR}" -maxdepth 1 -name 'code*.zip' 2>/dev/null)
if [[ -n "${STALE_ZIPS}" ]]; then
  warn "发现残留的 code*.zip 文件，正在删除..."
  find "${PROJECT_DIR}" -maxdepth 1 -name 'code*.zip' -exec rm -f {} \;
  success "已清理残留 zip 文件"
else
  success "无残留 code*.zip 文件"
fi

# ══════════════════════════════════════════════════════════════
# Step 2：检查构建产物大小
# ══════════════════════════════════════════════════════════════
step "Step 2  检查构建产物大小"

if [ ! -d "dist" ]; then
  error "dist/ 目录不存在，编译可能失败"
  exit 1
fi

DIST_SIZE_KB=$(du -sk dist | awk '{print $1}')
DIST_SIZE_HUMAN=$(du -sh dist | awk '{print $1}')
DIST_FILES=$(find dist -type f | wc -l | tr -d ' ')

echo ""
echo -e "  ${BOLD}构建产物统计：${NC}"
echo -e "  ├─ 路径：         dist/"
echo -e "  ├─ 文件数量：     ${DIST_FILES} 个"
echo -e "  └─ 总大小：       ${DIST_SIZE_HUMAN} (${DIST_SIZE_KB} KB)"
echo ""
echo -e "  ${BOLD}目录明细：${NC}"
du -sh dist/* 2>/dev/null | sort -rh | while read -r size path; do
  printf "  ├─ %-40s %s\n" "$(basename "$path")" "$size"
done
echo ""

# 检查 dist/test 是否被意外编译进来
if [ -d "dist/test" ]; then
  error "dist/test/ 目录存在！tsconfig.build.json 的 exclude 配置可能失效"
  error "请检查 nest-cli.json 的 tsConfigPath 是否指向 tsconfig.build.json"
  exit 1
fi

if [ "${DIST_SIZE_KB}" -gt "${DIST_SIZE_HARD_LIMIT_KB}" ]; then
  error "dist/ 超过硬限制 $(( DIST_SIZE_HARD_LIMIT_KB / 1024 )) MB（当前 ${DIST_SIZE_HUMAN}），中止"
  error "常见原因：test/ 目录被编译进 dist/，或 tsconfig 未使用 tsconfig.build.json"
  exit 1
elif [ "${DIST_SIZE_KB}" -gt "${DIST_SIZE_WARN_KB}" ]; then
  warn "dist/ 较大（${DIST_SIZE_HUMAN}），建议排查是否有多余文件"
else
  success "构建产物大小正常（${DIST_SIZE_HUMAN}，${DIST_FILES} 个文件）"
fi

# ══════════════════════════════════════════════════════════════
# 预检完成
# ══════════════════════════════════════════════════════════════
echo ""
success "预检通过！代码已就绪，可通过 CloudBase CLI 部署："
echo ""
echo -e "  ${BOLD}CLI 部署命令（staging）：${NC}"
echo -e "  ${CYAN}cd ${PROJECT_DIR} && echo \"n\" | tcb cloudrun deploy -s minicare-api --port 3000 --force -e minicare-cloud-6gqledlle0132cbe${NC}"
echo ""
echo -e "  ${BOLD}CLI 部署命令（production）：${NC}"
echo -e "  ${CYAN}cd ${PROJECT_DIR} && echo \"n\" | tcb cloudrun deploy -s minicare-api-production --port 3000 --force -e minicare-cloud-6gqledlle0132cbe${NC}"
echo ""
echo -e "  ${BOLD}查看服务状态：${NC}"
echo -e "  ${CYAN}tcb cloudrun list --serviceName minicare-api --json -e minicare-cloud-6gqledlle0132cbe${NC}"
echo ""
