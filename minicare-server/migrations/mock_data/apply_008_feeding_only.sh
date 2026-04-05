#!/usr/bin/env bash
# 按顺序执行 008_feeding_only 分片 SQL（用于 mysql 客户端批量导入）
set -euo pipefail
DIR="$(cd "$(dirname "$0")/008_feeding_only" && pwd)"
for f in \
  "$DIR/00_setup.sql" \
  "$DIR/01_neonatal_day01_28.sql" \
  "$DIR/02_transition_day29_45.sql" \
  "$DIR/03_eh_no_lactose_day46_69.sql" \
  "$DIR/04_mix_80_20_day70_80.sql" \
  "$DIR/05_mix_50_50_day81_96.sql" \
  "$DIR/06_eh_lactose_full_day97_100.sql" \
  "$DIR/99_footer.sql"
do
  if [[ ! -f "$f" ]]; then
    echo "missing: $f" >&2
    exit 1
  fi
  echo "-- source: $f" >&2
  cat "$f"
done
