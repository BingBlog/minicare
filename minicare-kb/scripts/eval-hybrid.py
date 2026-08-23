"""混合检索评测：FULLTEXT + TokenHub 向量余弦 → RRF 融合

对比：FULLTEXT only vs 混合（RRF k=60）——验证向量路对召回的实际增益。
评测口径同 eval-recall.py：关键信息命中率（key_info 关键词在 top10 命中比例）。
"""
from __future__ import annotations

import re
import statistics
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pymysql  # noqa: E402

from kb_pipeline.config import get_settings  # noqa: E402
from kb_pipeline.embed.hunyuan import embed_one  # noqa: E402

TEST_SET = Path("/Users/bing/Documents/minicare-v1/docs/敏宝知识库/召回测试集-种子50题.md")
RRF_K = 60


def parse_testset(path: Path) -> list[dict]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-H]-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|", line)
        if m and not m.group(2).startswith("question"):
            items.append({"qid": m.group(1), "question": m.group(2), "key_info": m.group(6), "risk": m.group(7)})
    return items


def main() -> None:
    settings = get_settings()
    conn = pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=settings.db_name, charset="utf8mb4",
    )
    # 预载向量（id → [float]）
    with conn.cursor() as cur:
        cur.execute("SELECT id, kb_id, embedding FROM knowledge_base WHERE embedding IS NOT NULL")
        vec_rows = cur.fetchall()
    emb_map = {r[0]: struct.unpack("<1024f", r[2]) for r in vec_rows}
    id_to_kb = {r[0]: r[1] for r in vec_rows}  # id → kb_id
    print(f"已载入 {len(emb_map)} 条向量")

    items = parse_testset(TEST_SET)
    rows = []
    for it in items:
        q = it["question"]
        # FULLTEXT 路
        with conn.cursor() as cur:
            cur.execute(
                """SELECT kb_id FROM knowledge_base WHERE status=1
                   AND MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE)
                   ORDER BY MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE) DESC LIMIT 20""",
                (q, q),
            )
            fts_ids = [r[0] for r in cur.fetchall()]
        # 向量路：query 向量 → 余弦 top20
        qv = embed_one(q, settings)
        scored = []
        for row_id, vec in emb_map.items():
            sim = sum(a * b for a, b in zip(qv, vec))
            scored.append((sim, id_to_kb.get(row_id)))
        scored.sort(reverse=True)
        vec_ids = [k for _, k in scored[:20] if k]
        # RRF 融合
        rrf: dict[str, float] = {}
        for rank, kid in enumerate(fts_ids):
            rrf[kid] = rrf.get(kid, 0) + 1 / (RRF_K + rank + 1)
        for rank, kid in enumerate(vec_ids):
            rrf[kid] = rrf.get(kid, 0) + 1 / (RRF_K + rank + 1)
        fused = [k for k, _ in sorted(rrf.items(), key=lambda x: -x[1])][:10]
        # 关键信息命中
        kws = [p for p in re.split(r"[、，。；\s/]+", it["key_info"]) if len(p) >= 2]
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT kb_id, content FROM knowledge_base WHERE kb_id IN ({','.join(['%s']*len(fused))})",
                fused,
            )
            content_map = {r[0]: r[1] for r in cur.fetchall()}
        hit = [kw for kw in kws if any(kw in content_map.get(k, "") for k in fused)]
        rows.append((it["qid"], it["question"], it["risk"], hit, [k for k in kws if k not in hit]))

    conn.close()
    avg = statistics.mean(len(r[3]) / max(len(r[3]) + len(r[4]), 1) for r in rows)
    full = sum(1 for r in rows if not r[4])
    print(f"\n测试集 {len(items)} 题 | 混合检索(RRF) 平均关键信息命中 {avg:.1%} | 全命中 {full} 题")
    print("（对比 FULLTEXT only: 13.5% | 1 题）")
    print("\n=== 未全命中（抽样 10）===")
    for r in [x for x in rows if x[4]][:10]:
        print(f"[{r[0]}]({r[2]}) {r[1][:24]}… 命中{len(r[3])} 缺:{r[4][:2]}")


if __name__ == "__main__":
    main()
