"""embed 编排：全量 active 且非 review 条目 → 混元向量 → 写回 embedding BLOB

只处理 embedding IS NULL 的条目（增量，可断点续跑）；review 条目跳过（不进检索）。
"""
from __future__ import annotations

import struct

import pymysql

from ..config import Settings
from ..logger import get_logger
from .hunyuan import embed_texts

log = get_logger(__name__)

BATCH = 16  # 混元 InputList ≤50，取 16 兼顾稳定性


def _to_blob(vec: list[float]) -> bytes:
    """float32 小端序列化"""
    return struct.pack(f"<{len(vec)}f", *vec)


def embed_all(settings: Settings, limit: int | None = None) -> tuple[int, int]:
    """对 embedding IS NULL 的 active 条目生成向量并写回。返回 (成功, 跳过review)"""
    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset="utf8mb4",
        autocommit=False,
    )
    done = 0
    skipped_review = 0
    try:
        with conn.cursor() as cur:
            # 待向量化条目（非 review、无向量）
            sql = (
                "SELECT id, content FROM knowledge_base "
                "WHERE status=1 AND embedding IS NULL "
                "AND content NOT LIKE '[待复核]%'"
            )
            if limit:
                sql += f" LIMIT {limit}"
            cur.execute(sql)
            rows = cur.fetchall()
            total = len(rows)
            log.info(f"[embed] 待向量化 {total} 条")
            for i in range(0, total, BATCH):
                batch_rows = rows[i : i + BATCH]
                texts = [r[1][:2000] for r in batch_rows]  # 混元单条 ≤1024 token，截断保护
                vecs = embed_texts(texts, settings)
                for (row_id, _), vec in zip(batch_rows, vecs):
                    cur.execute(
                        "UPDATE knowledge_base SET embedding=%s WHERE id=%s",
                        (_to_blob(vec), row_id),
                    )
                done += len(batch_rows)
                conn.commit()
                log.info(f"[embed] 进度 {min(i + BATCH, total)}/{total}")
            # review 计数（仅统计，不向量化）
            cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE content LIKE '[待复核]%'")
            skipped_review = cur.fetchone()[0]
        return done, skipped_review
    finally:
        conn.close()
