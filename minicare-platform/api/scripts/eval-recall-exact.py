"""精确 Recall@10 评测：测试集 gold KB 条目 → 映射表 → 命中判定

口径（M02 §7）：Recall@10 = 每题 gold 条目对应知识块在 top10 中被命中的比例，≥90% 为上线闸门。
gold 命中：该条目映射的任一 kb_id 出现在 top10。
"""
from __future__ import annotations

import json
import re
import statistics
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pymysql  # noqa: E402

from kb_pipeline.config import get_settings  # noqa: E402
from kb_pipeline.embed.hunyuan import embed_one  # noqa: E402

TEST_SET = Path(__file__).resolve().parents[3] / "docs" / "knowledge" / "research" / "召回测试集-种子50题.md"
# 映射表为构建期中间产物（var/ 下）；如缺失，见 minicare-platform/api/docs/KB-MAPPING.md
MAPPING = Path(__file__).resolve().parents[1] / "var" / "kb_mapping.json"
RRF_K = 60


def parse_testset(path: Path) -> list[dict]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-H]-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|", line)
        if m and not m.group(2).startswith("question"):
            gold = re.findall(r"KB-[A-H]\d+", m.group(3))
            acc = re.findall(r"KB-[A-H]\d+", m.group(4))
            neg = re.findall(r"KB-[A-H]\d+", m.group(5))
            items.append({
                "qid": m.group(1), "question": m.group(2),
                "gold": gold, "acc": acc, "neg": neg, "risk": m.group(7),
            })
    return items


def main() -> None:
    settings = get_settings()
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    # KB 条目 → 知识块集合（映射表 top3 全取，提高容错）
    kb_to_chunks = {code: set(v) for code, v in mapping.items()}

    conn = pymysql.connect(
        host=settings.db_host, port=settings.db_port, user=settings.db_user,
        password=settings.db_password, database=settings.db_name, charset="utf8mb4",
    )
    with conn.cursor() as cur:
        cur.execute("SELECT id, kb_id, embedding FROM knowledge_base WHERE embedding IS NOT NULL")
        vrows = cur.fetchall()
    emb_map = {r[0]: struct.unpack("<1024f", r[2]) for r in vrows}
    id_to_kb = {r[0]: r[1] for r in vrows}
    print(f"已载入 {len(emb_map)} 条向量")

    items = parse_testset(TEST_SET)
    rows = []
    for it in items:
        q = it["question"]
        with conn.cursor() as cur:
            cur.execute(
                """SELECT kb_id FROM knowledge_base WHERE status=1
                   AND MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE)
                   ORDER BY MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE) DESC LIMIT 20""",
                (q, q),
            )
            fts = [r[0] for r in cur.fetchall()]
        qv = embed_one(q, settings)
        scored = sorted(((sum(a * b for a, b in zip(qv, vec)), rid) for rid, vec in emb_map.items()), reverse=True)
        vec_ids = [id_to_kb.get(rid) for _, rid in scored[:20] if id_to_kb.get(rid)]
        rrf = {}
        for rank, kid in enumerate(fts):
            rrf[kid] = rrf.get(kid, 0) + 1 / (RRF_K + rank + 1)
        for rank, kid in enumerate(vec_ids):
            rrf[kid] = rrf.get(kid, 0) + 1 / (RRF_K + rank + 1)
        top10 = [k for k, _ in sorted(rrf.items(), key=lambda x: -x[1])][:10]
        top10_set = set(top10)
        # gold 命中
        gold_chunks = set()
        for code in it["gold"]:
            gold_chunks |= kb_to_chunks.get(code, set())
        gold_hit = bool(gold_chunks & top10_set) if gold_chunks else False
        # harmful：negative 条目进 top5
        neg_chunks = set()
        for code in it["neg"]:
            neg_chunks |= kb_to_chunks.get(code, set())
        harmful = bool(neg_chunks & set(top10[:5])) if neg_chunks else False
        rows.append({
            "qid": it["qid"], "question": it["question"], "risk": it["risk"],
            "gold": it["gold"], "gold_hit": gold_hit, "harmful": harmful,
            "top10": top10,
        })

    conn.close()
    total = len(rows)
    gold_hits = sum(1 for r in rows if r["gold_hit"])
    harmful_n = sum(1 for r in rows if r["harmful"])
    print(f"\n=== 精确 Recall@10（gold 条目命中，含 F-01 等无映射条目计未命中）===")
    print(f"gold 命中: {gold_hits}/{total} = {gold_hits / total:.1%}  （目标 ≥90%）")
    print(f"有害召回（negative 进 top5）: {harmful_n}")
    print()
    print("=== 未命中题目 ===")
    for r in rows:
        if not r["gold_hit"]:
            print(f"[{r['qid']}]({r['risk']}) {r['question'][:28]}… gold={r['gold']}")
            print(f"   top5: {r['top10'][:5]}")


if __name__ == "__main__":
    main()
