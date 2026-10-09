"""步骤 6 · 索引：向量化 + 全文索引 + 写入目标库

第 1 期的两种运行模式：
  - `dry_run=True`（默认用于本地验证）—— 只产出**入库计划**，不写库、不调向量服务。
    目的是让整条六步编排能在没有数据库与云凭证的环境下被完整验证。
  - 实跑 —— 复用现有 `store/knowledge_base.py` 的 upsert 与 `embed/runner.py`：
    先 upsert（保持现状行为），再对 `embedding IS NULL` 的条目补向量。
    ⚠️ 迁移 021 落地前，库结构与检索端过滤条件保持**现状不变**（PRD R-04 的隔离策略）。
"""
from __future__ import annotations

from ..models import Chunk
from ..store.knowledge_base import upsert_knowledge_base
from . import StepContext

EMBEDDING_MODEL_DEFAULT_DIM = 1024


def _plan_entry(chunk: Chunk) -> dict:
    return {
        "kb_id": chunk.kb_id,
        "title": chunk.title[:60],
        # 目标语义（迁移 021 后写入 knowledge_base.retrieval_status）
        "retrieval_status": chunk.retrieval_status,
        "risk_level": chunk.risk_level,
        "chunk_type": chunk.chunk_type,
        "content_chars": len(chunk.content),
        "keywords": chunk.keywords or "",
        "page_idx": chunk.page_idx,
        "exclude_rule": chunk.exclude_rule,
    }


def run(ctx: StepContext) -> tuple[dict, dict]:
    validate_payload = ctx.upstream("validate")
    raw_chunks = list(validate_payload.get("chunks", []))

    # ── 人工产物优先于机器产物（PRD FR-1.11 / FR-1.13 / D-09）──
    # 装配已抽到 `steps/finalize.py`（TECH-019 §3.2）：translate 步骤与 index 必须吃同一份
    # "最终块"，否则人工编辑过的块会出现"译文对不上入库文本"的错位。纯抽取，行为不变。
    from .finalize import finalize_chunks

    raw_chunks, edit_stats, review_stats = finalize_chunks(ctx.store, validate_payload, ctx.settings)

    chunks = [Chunk.from_dict(c) for c in raw_chunks]
    excluded = [c for c in chunks if c.retrieval_status == "excluded"]
    review = [c for c in chunks if c.retrieval_status == "review"]
    enabled = [c for c in chunks if c.retrieval_status == "enabled"]

    settings = ctx.settings
    model = settings.tokenhub_embedding_model
    has_vector_key = bool(settings.tokenhub_api_key)
    has_db = bool(settings.db_user)

    payload: dict = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "keyword_source": validate_payload.get("keyword_source", "rule"),
        "mode": "dry_run" if ctx.dry_run else "write",
        "target": {
            "db_host": settings.db_host,
            "db_name": settings.db_name,
            "table": "knowledge_base",
        },
        "embedding": {
            "model": model,
            "dim": EMBEDDING_MODEL_DEFAULT_DIM,
            "available": has_vector_key,
        },
        "counts": {
            "chunks_total": len(chunks),
            "to_index": len(enabled),
            "review_excluded": len(review),
            "noise_excluded": len(excluded),
        },
        "excluded_detail": [
            {"kb_id": c.kb_id, "title": c.title, "rule": c.exclude_rule,
             "reason": c.exclude_reason, "by": c.exclude_by, "chars": len(c.content)}
            for c in excluded
        ],
        "edit_stats": edit_stats,
        "review_stats": {k: v for k, v in review_stats.items() if k != "changed"},
        "content_changed": review_stats.get("changed", []),
        "plan": [_plan_entry(c) for c in chunks],
        "warnings": [],
    }

    if ctx.dry_run:
        payload["warnings"].append("dry_run：未写库、未调用向量服务（仅产出入库计划）")
        stats = {
            "to_index": len(enabled),
            "review": len(review),
            "noise_excluded": len(excluded),
            "written": 0,
            "embedded": 0,
            "dry_run": True,
        }
        return payload, stats

    if not has_db:
        raise RuntimeError("缺少 DB 配置（DB_USER 等），无法执行入库；可改用 dry_run=True")

    # 1) 切片入库（复用现有 upsert：按 kb_id 幂等，事务批量）
    #    ⚠️ 迁移 021 之前库表没有 retrieval_status 列，**无法表达"屏蔽但保留"**。
    #    因此 021 落地前，屏蔽块**不写入库**（这正是它该有的检索行为）；内容仍完整保留在
    #    产物里（raw/ + segment.json + edits/），不丢数据。021 落地后改为写入并置 excluded。
    writable = enabled + review
    if excluded:
        payload["warnings"].append(
            f"迁移 021 未执行：{len(excluded)} 个屏蔽块未写库（内容仍在产物与「已屏蔽内容」页保留）；"
            "021 落地后改为写入并置 retrieval_status=excluded"
        )
    written, review_written = upsert_knowledge_base(writable, settings, replace=False)

    # 内容被人工改动过的块：**清掉旧向量**，让下面的 embed_all 重算
    # （否则会出现"文本已改、向量还是旧的"这种静默降质）
    changed = review_stats.get("changed") or []
    if changed:
        import pymysql

        conn = pymysql.connect(host=settings.db_host, port=settings.db_port, user=settings.db_user,
                               password=settings.db_password, database=settings.db_name, charset="utf8mb4")
        try:
            with conn.cursor() as cur:
                ph = ",".join(["%s"] * len(changed))
                cur.execute(f"UPDATE knowledge_base SET embedding=NULL WHERE kb_id IN ({ph})", tuple(changed))
            conn.commit()
        finally:
            conn.close()
        payload["warnings"].append(f"{len(changed)} 个块内容被人工改动，已清空旧向量等待重算")

    # 2) 向量化（增量：只补 embedding IS NULL 的条目）
    embedded = 0
    if has_vector_key:
        from ..embed.runner import embed_all

        embedded, _skipped = embed_all(settings)
    else:
        payload["warnings"].append("缺少 TOKENHUB_API_KEY：跳过向量化，该文档暂时只有全文索引可用")

    payload["written"] = written
    payload["review_written"] = review_written
    payload["embedded"] = embedded
    stats = {
        "to_index": len(enabled),
        "review": len(review),
        "noise_excluded": len(excluded),
        "written": written,
        "embedded": embedded,
        "dry_run": False,
    }
    return payload, stats
