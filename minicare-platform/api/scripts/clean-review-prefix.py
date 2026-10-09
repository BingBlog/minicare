#!/usr/bin/env python3
"""迁移 021 · 第 5 阶段：清理 [待复核] 前缀（**不可逆**）

对应 TECH-015 §9.1 的第 ⑤ 步，**必须先完成第 ④ 阶段**（minicare-agent 已切到
`retrieval_status='enabled'` 过滤）。否则删掉前缀会让 review 条目进入检索。

⚠️ 用 `SUBSTRING(content, 6)` 而不是 `TRIM(LEADING '[待复核]' FROM content)`：
   TRIM 是按**字符集**删除而不是按子串，会误伤正文中以这些字开头的合法内容。
   `[待复核]` 恰好 5 个字符，因此偏移量是 6。

用法：
    cd minicare-platform/api && .venv/bin/python scripts/clean-review-prefix.py [--dry-run] [--yes]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from kb_pipeline.config import get_settings  # noqa: E402

LEGACY_PREFIX = "[待复核]"
PREFIX_LEN = len(LEGACY_PREFIX)      # = 5


def main(dry_run: bool = False, assume_yes: bool = False) -> int:
    import pymysql

    s = get_settings()
    if not s.db_user:
        print("✘ 缺少 DB 配置")
        return 2
    conn = pymysql.connect(host=s.db_host, port=s.db_port, user=s.db_user,
                           password=s.db_password, database=s.db_name, charset="utf8mb4")
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW COLUMNS FROM knowledge_base LIKE 'retrieval_status'")
            if cur.fetchone() is None:
                print("✘ 迁移 021 未执行")
                return 2
            cur.execute(
                "SELECT COUNT(*) FROM knowledge_base WHERE retrieval_status='review' "
                "AND content NOT LIKE %s", (LEGACY_PREFIX + "%",),
            )
            risk = cur.fetchone()[0]
            if risk:
                print(f"✘ 有 {risk} 条 retrieval_status='review' 但**没有**前缀 —— "
                      "说明字段已就位，可以安全清理其余前缀")

            cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE content LIKE %s", (LEGACY_PREFIX + "%",))
            n = cur.fetchone()[0]
            print(f"待清理前缀 {n} 条")
            if n == 0:
                print("✔ 无需清理")
                return 0
            if dry_run:
                print("（dry-run：未写库）")
                return 0
            if not assume_yes:
                print("⚠️ 本操作不可逆。确认 minicare-agent 已切换过滤条件后，加 --yes 执行。")
                return 1

            cur.execute(
                "UPDATE knowledge_base SET content=SUBSTRING(content, %s) WHERE content LIKE %s",
                (PREFIX_LEN + 1, LEGACY_PREFIX + "%"),
            )
            cleaned = cur.rowcount
            cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE content LIKE %s", (LEGACY_PREFIX + "%",))
            left = cur.fetchone()[0]
        conn.commit()
        print(f"✔ 已清理 {cleaned} 条；剩余带前缀 {left} 条（应为 0）")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main(dry_run="--dry-run" in sys.argv, assume_yes="--yes" in sys.argv))
