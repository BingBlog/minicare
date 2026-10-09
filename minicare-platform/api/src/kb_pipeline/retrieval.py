"""检索层（平台侧参考实现）

**为什么平台要自己有一份检索实现**：`检索质检`（US-11）必须能独立评测知识库，
不能依赖 `agent-poc` 是否在跑。因此这里按 `agent-poc/src/lib/tools/search-knowledge.js`
的同一套逻辑复刻：FULLTEXT ngram + 向量余弦 + RRF(k=60) → topK。

⚠️ **两份实现必须保持一致**：`contract.py` 的语义校验与未来的 A/B 都依赖这点。
若改了一侧，另一侧必须同步改（TECH-015 §9.1 的契约里已声明"检索方式"）。
"""
from __future__ import annotations

import struct

from .config import Settings
from .store.knowledge_base import REVIEW_PREFIX

RRF_K = 60
CONTENT_MAX_CHARS = 800


def _blob_to_vec(blob) -> list[float] | None:
    if blob is None:
        return None
    buf = bytes(blob)
    if len(buf) % 4 != 0:
        return None
    return list(struct.unpack(f"<{len(buf) // 4}f", buf))


def _cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    dot = na = nb = 0.0
    for i in range(n):
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    if na == 0 or nb == 0:
        return 0.0
    return dot / ((na ** 0.5) * (nb ** 0.5))


def has_retrieval_status_column(cur) -> bool:
    """探测迁移 021 是否已执行（决定用哪个过滤条件）

    这是**双写过渡期**的关键：021 之前用 `content` 前缀过滤，之后用字段过滤。
    探测失败一律按"未执行"处理（更保守：前缀过滤对两种状态都有效）。
    """
    try:
        cur.execute("SHOW COLUMNS FROM knowledge_base LIKE 'retrieval_status'")
        return cur.fetchone() is not None
    except Exception:      # noqa: BLE001 - 探测失败不影响主流程
        return False


def retrieval_filter(with_status_column: bool) -> tuple[str, tuple[str, ...]]:
    """被屏蔽/待复核的条目永不出现（契约语义约束①）；返回 (SQL 片段, 绑定参数)

    ⚠️ **迁移 021 之前的前缀过滤必须走参数绑定**，不能把字面 `%` 写进 SQL 字符串：
    pymysql 在 `args` 非空时会执行 `query % args`，SQL 里残留的 `%` 会被当成格式符去
    解析 —— 实测报 `unsupported format character "'" (0x27)`，位置正好落在
    `'[待复核]%'` 的那个 `%'` 上（该 bug 在库不可达时被 try/except 掩盖，接上库才暴露）。
    写法与 `scripts/clean-review-prefix.py` 一致。
    """
    if with_status_column:
        return "status=1 AND retrieval_status='enabled'", ()
    return "status=1 AND content NOT LIKE %s", (REVIEW_PREFIX + "%",)


def retrieve(
    settings: Settings,
    query: str,
    top_k: int = 10,
    *,
    risk_level: str | None = None,
    category: str | None = None,
    include_assets: bool = True,
    with_conn=None,
    trace: dict | None = None,
    mode: str = "hybrid",
    keyword_weight: float | None = None,
) -> list[dict]:
    """混合检索（FULLTEXT + 向量 + RRF），返回条目列表（含 score 与来源字段）

    `trace`（可选，仅「检索测试」诊断用）：传入一个 dict，函数会把本次检索的链路实况
    写进去 —— `vector_used`（向量路是否真的跑了）/ `vector_degraded`（没跑的原因）/
    `fts_count` / `vec_count` / `fusion`（本次融合口径），并给每条结果附 `routes`
    （该条目在全文/向量各路的名次与分数）。

    `mode` / `keyword_weight`（可选，**仅「检索测试」的实验参数**，2026-10-09 增）：
      · mode：`hybrid`（默认，两路都跑）/ `fts`（只跑全文）/ `vector`（只跑向量）；
      · keyword_weight：0~1，混合模式下全文路的权重（1-它 = 向量权重），
        内部按「系数 = 2w / 2(1-w)」连续过渡 —— **w=0.5 时系数 1.0/1.0，与线上等权
        完全一致**（页面滑杆的"均衡"档位不产生任何偏差）。
      ⚠️ 契约口径（KB-CONTRACT「FULLTEXT ngram + 向量余弦 + RRF(k=60)」）描述的是
      **默认路径**；上述两个参数只影响显式传入的调用（仅本机「检索测试」页），
      默认路径行为与从前逐字节一致 —— 质检（regression）与契约校验（contract）零感知。
    """
    mode = mode if mode in ("hybrid", "fts", "vector") else "hybrid"
    import pymysql

    conn = with_conn or pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=settings.db_name, charset="utf8mb4",
    )
    own = with_conn is None
    try:
        with conn.cursor() as cur:
            col = has_retrieval_status_column(cur)
            filter_sql, filter_args = retrieval_filter(col)
            where = [filter_sql]
            args: list = list(filter_args)
            if risk_level:
                where.append("risk_level=%s")
                args.append(risk_level)
            if category:
                where.append("category=%s")
                args.append(category)
            if not include_assets:
                where.append("category NOT IN ('table','image')")
            where_sql = " AND ".join(where)

            # 1) 关键词路（FULLTEXT ngram）。mode=vector（实验参数）时整段跳过
            # ⚠️ 参数顺序必须与占位符顺序严格一致。本语句有**三个**占位符，依次是：
            #     ① SELECT 里的 AGAINST  ← query
            #     ② WHERE 里的 NOT LIKE  ← args[0]（review 前缀；随后是 risk_level/category）
            #     ③ WHERE 里的 AGAINST   ← query
            #    即 `(query, *args, query)`。曾误写成 `(*args, query, query)`，导致过滤条件被
            #    绑到 SELECT 的 AGAINST 上、`content NOT LIKE '<查询词>'`，**review 条目直接泄漏**
            #    （契约语义约束①被破坏，且 ORDER BY 的相关度也变成对错误字符串打分）。
            fts: list[dict] = []
            if mode != "vector":
                cur.execute(
                    f"SELECT id, kb_id, title, category, content, source, risk_level, "
                    f"MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE) AS score "
                    f"FROM knowledge_base WHERE {where_sql} "
                    f"AND MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE) "
                    f"ORDER BY score DESC LIMIT 20",
                    (query, *args, query),
                )
                fts = [dict(r) if isinstance(r, dict) else _row(cur, r) for r in cur.fetchall()]

            # 2) 向量路（全表余弦；与 agent-poc 同口径）。mode=fts（实验参数）时整段跳过
            vec_rows: list[dict] = []
            qvec = _query_vector(query, settings, trace) if mode != "fts" else None
            if qvec is not None:
                cur.execute(
                    f"SELECT id, kb_id, title, category, content, source, risk_level, embedding "
                    f"FROM knowledge_base WHERE {where_sql} AND embedding IS NOT NULL",
                    tuple(args),
                )
                scored = []
                for r in cur.fetchall():
                    row = _row(cur, r)
                    v = _blob_to_vec(row.pop("embedding", None))
                    if v is None:
                        continue
                    row["score"] = _cosine(qvec, v)
                    scored.append(row)
                scored.sort(key=lambda x: -x["score"])
                vec_rows = scored[:20]

        # 3) RRF 融合
        #    线上口径 = 两路等权（各贡献 1/(60+名次)）；keyword_weight 是「检索测试」实验参数，
        #    系数按「2w / 2(1-w)」连续过渡（w=0.5 → 1.0/1.0，与线上等权完全一致，
        #    所以页面滑杆停在"均衡"不产生任何偏差）。单路模式（fts/vector）不乘权重。
        if keyword_weight is None or mode != "hybrid":
            coeff_fts = coeff_vec = 1.0
        else:
            w = min(1.0, max(0.0, float(keyword_weight)))
            coeff_fts, coeff_vec = 2.0 * w, 2.0 * (1.0 - w)
        fused: dict[str, dict] = {}
        for route, rows, coeff in (("fts", fts, coeff_fts), ("vec", vec_rows, coeff_vec)):
            for rank, row in enumerate(rows, 1):
                key = row.get("kb_id") or row.get("id")
                cur_rec = fused.setdefault(key, {"item": row, "rrf": 0.0})
                cur_rec["rrf"] += coeff / (RRF_K + rank)
                if trace is not None:
                    cur_rec.setdefault("routes", {})[route] = {
                        "rank": rank, "score": round(float(row.get("score") or 0), 4)}
        out: list[dict] = []
        for rec in sorted(fused.values(), key=lambda x: -x["rrf"]):
            item = {**rec["item"], "rrf": round(rec["rrf"], 6)}
            if trace is not None:
                item["routes"] = rec.get("routes") or {}
            out.append(item)
        for item in out:
            item["content_truncated"] = len(item.get("content") or "") > CONTENT_MAX_CHARS
            item["content"] = (item.get("content") or "")[:CONTENT_MAX_CHARS]
        if trace is not None:
            trace["vector_used"] = qvec is not None
            trace["fts_count"] = len(fts)
            trace["vec_count"] = len(vec_rows)
            trace["fusion"] = {
                "mode": mode,
                "keyword_weight": None if keyword_weight is None
                else round(min(1.0, max(0.0, float(keyword_weight))), 4),
                "coeff_fts": round(coeff_fts, 4),
                "coeff_vec": round(coeff_vec, 4),
            }
        return out[:top_k]
    finally:
        if own:
            conn.close()


def _row(cur, raw) -> dict:
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, raw))


def _query_vector(query: str, settings: Settings, trace: dict | None = None) -> list[float] | None:
    try:
        from .embed.hunyuan import embed_texts

        vecs = embed_texts([query], settings)
        if not vecs:
            if trace is not None:
                trace["vector_degraded"] = "embedding 返回为空"
            return None
        return vecs[0]
    except Exception as e:      # noqa: BLE001 - 向量不可用则只走 FULLTEXT（与 agent-poc 降级链一致）
        # 降级原因只写给「检索测试」诊断，默认路径（trace=None）保持静默，与 agent-poc 行为一致
        if trace is not None:
            trace["vector_degraded"] = f"{type(e).__name__}: {e}"[:300]
        return None
