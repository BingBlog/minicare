#!/usr/bin/env bash
# =============================================================
# migrate.sh — 数据库迁移脚本
# 用法:
#   ./scripts/migrate.sh              # 使用 .env 中的配置
#   ./scripts/migrate.sh --status     # 查看已执行的迁移版本
#   ./scripts/migrate.sh --dry-run    # 只列出待执行的迁移，不实际执行
# =============================================================

set -euo pipefail

# ── 加载 .env（如果存在）──────────────────────────────────────
if [ -f "$(dirname "$0")/../.env" ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' "$(dirname "$0")/../.env" | grep -v '^\s*$' | xargs)
fi

# ── 读取数据库连接参数 ────────────────────────────────────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-minicare_dev}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"
MYSQL_CMD="mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} ${DB_NAME}"
if [ -n "${DB_PASS}" ]; then
  MYSQL_CMD="mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASS} ${DB_NAME}"
fi

# ── 颜色输出 ─────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── 确保 schema_migrations 表存在 ────────────────────────────
ensure_migrations_table() {
  $MYSQL_CMD -e "
    CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`version\`    VARCHAR(50) NOT NULL,
      \`applied_at\` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  " 2>/dev/null
}

# ── 查询已执行的迁移 ──────────────────────────────────────────
get_applied() {
  $MYSQL_CMD -sN -e "SELECT version FROM schema_migrations ORDER BY version;" 2>/dev/null || echo ""
}

# ── --status 模式 ─────────────────────────────────────────────
if [[ "${1:-}" == "--status" ]]; then
  ensure_migrations_table
  echo -e "${GREEN}已执行的迁移：${NC}"
  $MYSQL_CMD -e "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
  exit 0
fi

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}[Dry Run] 仅预览，不实际执行${NC}"
fi

# ── 主迁移逻辑 ────────────────────────────────────────────────
ensure_migrations_table
APPLIED=$(get_applied)
PENDING=0

for sql_file in $(ls "${MIGRATIONS_DIR}"/*.sql 2>/dev/null | sort); do
  version=$(basename "${sql_file}" .sql)

  if echo "${APPLIED}" | grep -qx "${version}"; then
    echo -e "  ${GREEN}✓ ${version}${NC}  (已执行，跳过)"
    continue
  fi

  PENDING=$((PENDING + 1))

  if $DRY_RUN; then
    echo -e "  ${YELLOW}→ ${version}${NC}  [待执行]"
    continue
  fi

  echo -e "  ${YELLOW}→ 执行 ${version} ...${NC}"
  if $MYSQL_CMD < "${sql_file}"; then
    $MYSQL_CMD -e "INSERT IGNORE INTO schema_migrations (version) VALUES ('${version}');"
    echo -e "  ${GREEN}✓ ${version} 执行成功${NC}"
  else
    echo -e "  ${RED}✗ ${version} 执行失败，已中止${NC}"
    exit 1
  fi
done

if [ "${PENDING}" -eq 0 ]; then
  echo -e "${GREEN}✓ 数据库已是最新状态，无待执行迁移${NC}"
fi
