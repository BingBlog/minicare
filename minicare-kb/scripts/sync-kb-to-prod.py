"""同步知识库到生产库（scripts/sync-kb-to-prod.py）

P1 部署数据准备：dev 库（minicare_dev）已有 1586 条 + embedding，
生产库（minicare-cloud-6gqledlle0132cbe）尚无 knowledge_base 表。
本脚本：
  1) 执行 017_knowledge_base.sql 建表（幂等，IF NOT EXISTS）
  2) 从 var/chunks.jsonl 导入条目（幂等 upsert by kb_id）
  3) 从 dev 库按 kb_id 拷贝 embedding（1584 条；embedding 只依赖 content，
     两份数据同源，kb_id 唯一，可安全复制，省去重新调用 TokenHub）

用法：.venv/bin/python scripts/sync-kb-to-prod.py
⚠️ 写生产库，执行前确认环境；幂等可重跑。
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from kb_pipeline.config import get_settings  # noqa: E402
from kb_pipeline.store.knowledge_base import load_chunks_jsonl, upsert_knowledge_base  # noqa: E402

PROD_DB = "minicare-cloud-6gqledlle0132cbe"
MIGRATION = Path(__file__).resolve().parents[2] / "minicare-server" / "migrations" / "017_knowledge_base.sql"
DEV_DB = "minicare_dev"


def run_ddl(settings, ddl: str) -> None:
    conn = pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=settings.db_name, charset="utf8mb4",
        autocommit=False,
    )
    try:
        with conn.cursor() as cur:
            for stmt in ddl.split(";"):
                if stmt.strip():
                    cur.execute(stmt)
        conn.commit()
        print(f"[ddl] 建表完成（{settings.db_name}）")
    finally:
        conn.close()


def copy_embeddings(settings) -> int:
    """从 dev 库按 kb_id 拷贝 embedding 到生产库。返回拷贝条数。"""
    # dev 读取
    src = pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=DEV_DB, charset="utf8mb4",
    )
    rows = []
    with src.cursor() as cur:
        cur.execute("SELECT kb_id, embedding FROM knowledge_base WHERE embedding IS NOT NULL")
        rows = cur.fetchall()
    src.close()
    print(f"[embed] dev 读取 {len(rows)} 条向量")

    # prod 写入
    dst = pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=settings.db_name, charset="utf8mb4",
        autocommit=False,
    )
    done = 0
    try:
        with dst.cursor() as cur:
            for kb_id, blob in rows:
                cur.execute(
                    "UPDATE knowledge_base SET embedding=%s WHERE kb_id=%s AND embedding IS NULL",
                    (blob, kb_id),
                )
                done += cur.rowcount
        dst.commit()
        print(f"[embed] 生产库写入 {done} 条")
    finally:
        dst.close()
    return done


def main() -> None:
    s = get_settings()
    s.db_name = PROD_DB  # 覆盖为目标库

    if not MIGRATION.exists():
        raise SystemExit(f"迁移文件不存在: {MIGRATION}")
    ddl = MIGRATION.read_text(encoding="utf-8")

    print(f"=== 生产库知识库同步: {s.db_host}:{s.db_port}/{s.db_name} ===")
    run_ddl(s, ddl)
    chunks = load_chunks_jsonl(s.store_cfg.chunk_jsonl)
    ok, review = upsert_knowledge_base(chunks, s, replace=False)
    print(f"[import] 入库 {ok} 条（review {review} 条）")
    n = copy_embeddings(s)

    # 复核
    conn = pymysql.connect(
        host=s.db_host, port=s.db_port, user=s.db_user,
        password=s.db_password, database=s.db_name, charset="utf8mb4",
    )
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM knowledge_base")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE embedding IS NOT NULL")
        emb = cur.fetchone()[0]
    conn.close()
    print(f"[verify] 生产库 {PROD_DB}: 总 {total} 条 / 有向量 {emb} 条")


if __name__ == "__main__":
    main()
