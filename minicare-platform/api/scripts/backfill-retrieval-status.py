#!/usr/bin/env python3
"""迁移 021 · 第 3 阶段：回填 retrieval_status / review_state（**前缀不动**）

对应 TECH-015 §9.1 的五阶段执行序：

    ① 只加列（021_knowledge_retrieval_status.sql，不含回填）
    ② 平台双写（写字段 + 保留 content 前缀）
 →  ③ **本脚本**：把历史 [待复核] 条目置 review/pending；其余保持 enabled
    ④ agent-poc 切到 retrieval_status='enabled' 过滤
    ⑤ clean-review-prefix.py 清理前缀（不可逆）

⚠️ 本脚本**不改动 content**。去掉前缀是第 ⑤ 阶段的事，因为第 ④ 阶段之前
   agent-poc 还在用前缀过滤 —— 提前删掉会让那 2 条 review 条目进入检索。

用法：
    cd minicare-platform/api && .venv/bin/python scripts/backfill-retrieval-status.py [--dry-run]

幂等：可反复执行。连接信息取 .env（DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from kb_pipeline.config import get_settings  # noqa: E402

LEGACY_PREFIX = "[待复核]"


def main(dry_run: bool = False) -> int:
    import pymysql

    s = get_settings()
    if not s.db_user:
        print("✘ 缺少 DB 配置（.env 的 DB_USER 等）")
        return 2
    conn = pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                           password=s.db_password, database=s.db_name, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM knowledge_base LIKE 'retrieval_status'")
            if cur.fetchone() is None:
                print("✘ retrieval_status 列不存在：请先执行迁移 021（只加列那一步）")
                return 2

            cur.execute("SELECT COUNT(*) FROM knowledge_base")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE content LIKE %s", (LEGACY_PREFIX + "%",))
            review_n = cur.fetchone()[0]
            print(f"库内 {total} 条；其中带 {LEGACY_PREFIX} 前缀 {review_n} 条")

            if dry_run:
                print("（dry-run：未写库）")
                return 0

            cur.execute(
                "UPDATE knowledge_base SET retrieval_status='review', review_state='pending' "
                "WHERE content LIKE %s", (LEGACY_PREFIX + "%",),
            )
            marked = cur.rowcount
            cur.execute(
                "UPDATE knowledge_base SET retrieval_status='enabled' "
                "WHERE retrieval_status IS NULL OR retrieval_status=''"
            )
            cur.execute(
                "SELECT retrieval_status, COUNT(*) FROM knowledge_base GROUP BY retrieval_status"
            )
            dist = cur.fetchall()
        conn.commit()
        print(f"✔ 已置 review/pending {marked} 条；前缀**保持不动**（第 ⑤ 阶段才清理）")
        print("  状态分布：" + ", ".join(f"{k}={v}" for k, v in dist))
        print("  下一步：④ 部署 agent-poc（过滤条件改为 retrieval_status='enabled'）")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(dry_run="--dry-run" in sys.argv))
