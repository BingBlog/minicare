#!/usr/bin/env bash
# =============================================================
# migrate.sh — 数据库迁移脚本
# 用法:
#   ./scripts/migrate.sh              # 迁移单库（从 .env.local 读取配置）
#   ./scripts/migrate.sh --all-envs   # 同时迁移开发库和测试库（推荐）
#   ./scripts/migrate.sh --status     # 查看已执行的迁移版本
#   ./scripts/migrate.sh --dry-run    # 只列出待执行的迁移，不实际执行
#
# 两个远程数据库（同一 CynosDB 实例，不同 database）：
#   开发库：minicare_dev
#   测试库：minicare-cloud-6gqledlle0132cbe
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../migrations"

# ── 颜色输出 ─────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── 从指定 env 文件加载变量（不污染当前 shell 全局）───────────
load_env() {
  local env_file="$1"
  if [ -f "${env_file}" ]; then
    # shellcheck disable=SC2046
    export $(grep -v '^#' "${env_file}" | grep -v '^\s*$' | xargs)
  fi
}

# ── 构造 mysql 命令（含密码）─────────────────────────────────
make_mysql_cmd() {
  local host="$1" port="$2" user="$3" pass="$4" dbname="$5"
  if [ -n "${pass}" ]; then
    echo "mysql -h${host} -P${port} -u${user} -p${pass} ${dbname}"
  else
    echo "mysql -h${host} -P${port} -u${user} ${dbname}"
  fi
}

# ── 确保 schema_migrations 表存在 ────────────────────────────
ensure_migrations_table() {
  local cmd="$1"
  $cmd -e "
    CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`version\`    VARCHAR(50) NOT NULL,
      \`applied_at\` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  " 2>/dev/null
}

# ── 核心：对单个 database 执行所有待执行迁移 ─────────────────
run_migrations_for_db() {
  local db_label="$1"   # 显示名称，如 "开发库(minicare_dev)"
  local mysql_cmd="$2"  # 完整的 mysql 命令字符串
  local dry_run="$3"    # true / false

  echo ""
  echo -e "${BOLD}── ${db_label} ──${NC}"

  ensure_migrations_table "${mysql_cmd}"

  local applied
  applied=$(${mysql_cmd} -sN -e "SELECT version FROM schema_migrations ORDER BY version;" 2>/dev/null || echo "")

  local pending=0

  for sql_file in $(ls "${MIGRATIONS_DIR}"/*.sql 2>/dev/null | sort); do
    local version
    version=$(basename "${sql_file}" .sql)

    if echo "${applied}" | grep -qx "${version}"; then
      echo -e "  ${GREEN}✓ ${version}${NC}  (已执行，跳过)"
      continue
    fi

    pending=$((pending + 1))

    if [ "${dry_run}" = "true" ]; then
      echo -e "  ${YELLOW}→ ${version}${NC}  [待执行]"
      continue
    fi

    echo -e "  ${YELLOW}→ 执行 ${version} ...${NC}"
    if ${mysql_cmd} < "${sql_file}"; then
      ${mysql_cmd} -e "INSERT IGNORE INTO schema_migrations (version) VALUES ('${version}');"
      echo -e "  ${GREEN}✓ ${version} 执行成功${NC}"
    else
      echo -e "  ${RED}✗ ${version} 执行失败，已中止${NC}"
      exit 1
    fi
  done

  if [ "${pending}" -eq 0 ]; then
    echo -e "  ${GREEN}✓ 已是最新状态，无待执行迁移${NC}"
  fi
}

# ── --status 模式 ─────────────────────────────────────────────
if [[ "${1:-}" == "--status" ]]; then
  load_env "${SCRIPT_DIR}/../.env.local"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"
  DB_NAME="${DB_NAME:-minicare_dev}"
  DB_USER="${DB_USER:-root}"
  DB_PASS="${DB_PASS:-}"
  MYSQL_CMD=$(make_mysql_cmd "${DB_HOST}" "${DB_PORT}" "${DB_USER}" "${DB_PASS}" "${DB_NAME}")
  ensure_migrations_table "${MYSQL_CMD}"
  echo -e "${GREEN}已执行的迁移（${DB_NAME}）：${NC}"
  ${MYSQL_CMD} -e "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
  exit 0
fi

# ── 解析参数 ─────────────────────────────────────────────────
DRY_RUN=false
ALL_ENVS=false
DB_OVERRIDE=""

for arg in "$@"; do
  case "${arg}" in
    --dry-run)  DRY_RUN=true ;;
    --all-envs) ALL_ENVS=true ;;
    --db=*)     DB_OVERRIDE="${arg#--db=}" ;;
  esac
done

if [ "${DRY_RUN}" = "true" ]; then
  echo -e "${YELLOW}[Dry Run] 仅预览，不实际执行${NC}"
fi

# ── --all-envs：同时迁移开发库和测试库 ───────────────────────
if [ "${ALL_ENVS}" = "true" ]; then
  # 从 .env.local 读取连接信息（host/port/user/pass 对两个库相同）
  load_env "${SCRIPT_DIR}/../.env.local"
  DB_HOST="${DB_HOST:-sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com}"
  DB_PORT="${DB_PORT:-21002}"
  DB_USER="${DB_USER:-bing}"
  DB_PASS="${DB_PASS:-}"

  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║   minicare 数据库迁移（开发库 + 测试库）      ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
  echo -e "  ${CYAN}Host: ${DB_HOST}:${DB_PORT}${NC}"

  # 开发库
  DEV_DB="minicare_dev"
  DEV_CMD=$(make_mysql_cmd "${DB_HOST}" "${DB_PORT}" "${DB_USER}" "${DB_PASS}" "${DEV_DB}")
  run_migrations_for_db "开发库 (${DEV_DB})" "${DEV_CMD}" "${DRY_RUN}"

  # 测试库（minicare_staging）
  STAGING_DB="minicare_staging"
  STAGING_CMD=$(make_mysql_cmd "${DB_HOST}" "${DB_PORT}" "${DB_USER}" "${DB_PASS}" "${STAGING_DB}")
  run_migrations_for_db "Staging 库 (${STAGING_DB})" "${STAGING_CMD}" "${DRY_RUN}"

  # 正式库
  PROD_DB="minicare-cloud-6gqledlle0132cbe"
  PROD_CMD=$(make_mysql_cmd "${DB_HOST}" "${DB_PORT}" "${DB_USER}" "${DB_PASS}" "${PROD_DB}")
  run_migrations_for_db "正式库 (${PROD_DB})" "${PROD_CMD}" "${DRY_RUN}"

  echo ""
  echo -e "${GREEN}✓ 全部数据库迁移完成${NC}"
  exit 0
fi

# ── 单库模式（默认）─────────────────────────────────────────
load_env "${SCRIPT_DIR}/../.env.local"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
if [ -n "${DB_OVERRIDE}" ]; then
  DB_NAME="${DB_OVERRIDE}"
else
  DB_NAME="${DB_NAME:-minicare_dev}"
fi
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

MYSQL_CMD=$(make_mysql_cmd "${DB_HOST}" "${DB_PORT}" "${DB_USER}" "${DB_PASS}" "${DB_NAME}")

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   minicare 数据库迁移                        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo -e "  ${CYAN}Host: ${DB_HOST}:${DB_PORT}  DB: ${DB_NAME}${NC}"

run_migrations_for_db "${DB_NAME}" "${MYSQL_CMD}" "${DRY_RUN}"

echo ""
echo -e "${GREEN}✓ 迁移完成${NC}"
