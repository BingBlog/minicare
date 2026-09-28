"""入库：chunks.jsonl → knowledge_base 表（016 迁移，幂等 upsert by kb_id）

⚠️ 需要环境：DB_HOST/DB_USER/DB_PASSWORD/DB_NAME（.env）。review 条目也入库，
但 risk_level=caution + content 前缀 [待复核]（检索端过滤）。
"""
from __future__ import annotations

import json
from pathlib import Path

from ..logger import get_logger
from ..models import Chunk

log = get_logger(__name__)

REVIEW_PREFIX = "[待复核]"


def write_chunks_jsonl(chunks: list[Chunk], path: Path) -> None:
    """把 Chunk 列表写入 JSONL（按 doc 分组，追加语义由调用方控制）"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c.to_dict(), ensure_ascii=False) + "\n")


def load_chunks_jsonl(path: Path) -> list[Chunk]:
    chunks = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            chunks.append(Chunk.from_dict(json.loads(line)))
    return chunks


def upsert_knowledge_base(chunks: list[Chunk], settings, replace: bool = False) -> tuple[int, int]:
    """入库：返回 (成功数, review 数)。replace=True 时先清空表（离线全量重入）。"""
    import pymysql
    from uuid import uuid4

    conn = pymysql.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        charset="utf8mb4",
        autocommit=False,
    )
    ok = 0
    review = 0
    try:
        with conn.cursor() as cur:
            if replace:
                cur.execute("DELETE FROM knowledge_base")  # 离线全量重入：清空后重建
            for c in chunks:
                content = c.content
                if c.review:
                    review += 1
                    content = REVIEW_PREFIX + content
                title = c.title[:200]  # VARCHAR(200) 截断保护（超长英文标题）
                cur.execute(
                    """
                    INSERT INTO knowledge_base
                      (id, kb_id, module, title, category, content, keywords,
                       source, source_url, evidence_level, region, risk_level,
                       applicable_age, status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1)
                    ON DUPLICATE KEY UPDATE
                      title=VALUES(title), content=VALUES(content), keywords=VALUES(keywords),
                      risk_level=VALUES(risk_level), status=1
                    """,
                    (
                        str(uuid4()),
                        c.kb_id,
                        c.doc_id[:8],
                        title,
                        c.chunk_type,
                        content,
                        c.keywords,
                        c.source,
                        None,
                        c.evidence_level,
                        c.region,
                        c.risk_level,
                        c.applicable_age,
                    ),
                )
                ok += 1
        conn.commit()
        log.info(f"[store] 入库 {ok} 条（含 review {review} 条）")
        return ok, review
    finally:
        conn.close()
