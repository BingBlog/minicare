#!/usr/bin/env bash
# =============================================================
# deploy.sh — 后端 CloudRun 部署脚本
#
# 流程：
#   1. 本地 TypeScript 编译 (nest build → dist/)
#   2. 检查 dist/ 大小和内容是否异常（警告/阻止）
#   3. 通过 tcb CLI 上传源码包 + 创建新版本
#      上传内容：dist/ + package*.json + Dockerfile（约 1~2MB）
#      排除内容：由 .tcbignore 定义（node_modules / src 等）
#      注意：.dockerignore 只在云端 docker build 时生效，不控制上传内容
#            tcb CLI 使用 .tcbignore 在本地打包压缩时过滤文件
#
# 用法:
#   ./scripts/deploy.sh                   # 默认部署到 staging 环境
#   ./scripts/deploy.sh --env staging     # 明确指定 staging 环境
#   ./scripts/deploy.sh --env production  # 部署到生产环境（待配置）
#   ./scripts/deploy.sh --check           # 仅检查构建产物大小，不部署
#   npm run deploy                        # 同上（推荐入口）
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

# ── 解析参数 ─────────────────────────────────────────────────
DEPLOY_ENV="staging"   # 默认测试环境
CHECK_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      DEPLOY_ENV="$2"
      shift 2
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    *)
      error "未知参数：$1"
      echo "用法: $0 [--env staging|production] [--check]"
      exit 1
      ;;
  esac
done

# ── 环境配置 ─────────────────────────────────────────────────
case "$DEPLOY_ENV" in
  staging)
    ENV_ID="minicare-cloud-6gqledlle0132cbe"
    SERVICE_NAME="minicare-api"
    PORT=3000
    AUTH_TEST_MODE="true"
    ;;
  production)
    # 生产环境占位，后续配置真实 CloudBase 环境
    ENV_ID="${PROD_ENV_ID:-}"
    SERVICE_NAME="minicare-api"
    PORT=3000
    AUTH_TEST_MODE="false"
    if [[ -z "$ENV_ID" ]]; then
      error "生产环境尚未配置，请设置 PROD_ENV_ID 环境变量或更新此脚本"
      exit 1
    fi
    ;;
  *)
    error "不支持的环境：${DEPLOY_ENV}，可选：staging | production"
    exit 1
    ;;
esac

# dist 大小阈值（KB）
DIST_SIZE_WARN_KB=2000       # 2 MB 警告（含 .js/.map/.d.ts，正常约 1~1.5MB）
DIST_SIZE_HARD_LIMIT_KB=5000 # 5 MB 阻止（超出说明混入了 test/ 或其他无关文件）

# 上传文件数阈值（tcbignore 后）
UPLOAD_FILES_WARN=400        # 超过此数量说明可能混入了不该上传的文件

# ── 项目根目录 ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   minicare-server 部署                       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "目标环境:    ${BOLD}${DEPLOY_ENV}${NC}"
info "CloudBase:   ${ENV_ID}"
info "服务名称:    ${SERVICE_NAME}"
info "AUTH_TEST:   ${AUTH_TEST_MODE} $([ "$AUTH_TEST_MODE" = 'true' ] && echo '（固定验证码 123456）' || echo '（真实短信）')"
echo ""

# ══════════════════════════════════════════════════════════════
# Step 1：TypeScript 编译
# ══════════════════════════════════════════════════════════════
step "Step 1  TypeScript 编译"
info "执行 nest build ..."
npm run build
success "编译完成 → dist/"

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
  error "dist/test/ 目录存在！tsconfig.build.json 的 exclude 配置可能失效，部署已中止"
  error "请检查 nest-cli.json 的 tsConfigPath 是否指向 tsconfig.build.json"
  exit 1
fi

if [ "${DIST_SIZE_KB}" -gt "${DIST_SIZE_HARD_LIMIT_KB}" ]; then
  error "dist/ 超过硬限制 $(( DIST_SIZE_HARD_LIMIT_KB / 1024 )) MB（当前 ${DIST_SIZE_HUMAN}），部署已中止"
  error "常见原因：test/ 目录被编译进 dist/，或 tsconfig.json 未使用 tsconfig.build.json"
  exit 1
elif [ "${DIST_SIZE_KB}" -gt "${DIST_SIZE_WARN_KB}" ]; then
  warn "dist/ 较大（${DIST_SIZE_HUMAN}），建议排查是否有多余文件"
else
  success "构建产物大小正常（${DIST_SIZE_HUMAN}）"
fi

if $CHECK_ONLY; then
  info "仅检查模式，跳过部署"
  exit 0
fi

# ══════════════════════════════════════════════════════════════
# Step 3：检查 tcb CLI + 上传文件预估
# ══════════════════════════════════════════════════════════════
step "Step 3  检查部署环境"

if ! command -v tcb &>/dev/null; then
  error "未找到 tcb CLI，请先安装：npm install -g @cloudbase/cli"
  exit 1
fi

TCB_VERSION=$(tcb --version 2>/dev/null | head -1 || echo "unknown")
info "tcb CLI: ${TCB_VERSION}"

# 检查 .tcbignore 是否存在（控制上传时的打包内容，不同于 .dockerignore）
if [ ! -f ".tcbignore" ]; then
  error ".tcbignore 文件不存在！缺少此文件会导致 node_modules 被打包上传（体积 ~100MB+）"
  error "请创建 .tcbignore 文件，参考 .dockerignore 内容"
  exit 1
fi

# 预估上传文件数（排除 tcbignore 中的目录）
UPLOAD_FILES=$(find . -not -path "./node_modules/*" -not -path "./.git/*" \
  -not -path "./src/*" -not -path "./test/*" -not -path "./coverage/*" \
  -not -name "*.tsbuildinfo" -not -name "*.log" -not -name ".DS_Store" \
  -type f | wc -l | tr -d ' ')

echo ""
info "预估上传文件数：${UPLOAD_FILES} 个"

if [ "${UPLOAD_FILES}" -gt "${UPLOAD_FILES_WARN}" ]; then
  warn "上传文件数（${UPLOAD_FILES}）异常偏多，可能 node_modules 未被 .tcbignore 排除"
  warn "继续部署将导致超大压缩包（>100MB），上传极慢"
  read -r -p "  确认继续？[y/N] " size_confirm
  if [[ ! "$size_confirm" =~ ^[Yy]$ ]]; then
    info "已取消，请检查 .tcbignore 配置"
    exit 0
  fi
else
  success "上传文件数正常（${UPLOAD_FILES} 个）"
fi

# ══════════════════════════════════════════════════════════════
# Step 4：提示 CloudRun 环境变量配置
# ══════════════════════════════════════════════════════════════
step "Step 4  CloudRun 环境变量提示"

echo ""
echo -e "  ${YELLOW}⚠ 请确认 CloudRun 控制台已配置以下环境变量：${NC}"
echo -e "  ┌─────────────────────────────────────────────────"
echo -e "  │  NODE_ENV        = production"
echo -e "  │  TCB_ENV_ID      = ${ENV_ID}"
echo -e "  │  AUTH_TEST_MODE  = ${AUTH_TEST_MODE}"
echo -e "  │  JWT_SECRET      = <强随机密钥>"
echo -e "  │  DB_HOST         = <CloudBase MySQL 内网地址>"
echo -e "  │  DB_PORT         = 3306"
echo -e "  │  DB_NAME         = <数据库名>"
echo -e "  │  DB_USER         = <用户名>"
echo -e "  │  DB_PASS         = <密码>"
echo -e "  └─────────────────────────────────────────────────"
echo ""
echo -e "  参考文件：${BOLD}.env.staging${NC}"
echo ""

read -r -p "  已确认环境变量配置，继续部署？[y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  info "已取消部署"
  exit 0
fi

# ══════════════════════════════════════════════════════════════
# Step 5：部署到 CloudRun
# ══════════════════════════════════════════════════════════════
step "Step 5  部署到 CloudRun（${DEPLOY_ENV}）"

info "上传内容：dist/ + package*.json + Dockerfile（.tcbignore 排除 node_modules/src/test 等）"
info "开始上传..."

tcb run:deprecated version create \
  -e "${ENV_ID}" \
  -s "${SERVICE_NAME}" \
  -p . \
  --port "${PORT}" \
  -f 100

success "部署完成！100% 流量已切换到新版本"
echo ""
info "查看版本列表："
echo "  npm run deploy:list"
echo ""
info "服务访问地址："
echo "  https://${ENV_ID}-1253854169.ap-shanghai.app.tcloudbase.com"
echo ""
