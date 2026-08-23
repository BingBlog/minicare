"""切块 + embedding 模型 2×2 对比评测

A: 自研切块 + 0.6b（DB 已有向量，基线 97.8%）
C: 自研切块 + 4b
D: LlamaIndex 切块 + 4b
（B: LlamaIndex+0.6b 需 0.6b 开通后付费，暂缺）

指标：关键信息命中率（key_info 关键词在向量 top10 命中）+ Recall@10（KB 映射，仅自研切块可用）
⚠️ 关键信息命中率仅用于本脚本横向对比切块/embedding 方案，不得作为知识库质量评估口径
（该指标已确认失真弃用，质量评估一律用精确 Recall@10：scripts/eval-recall-exact.py）
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
from kb_pipeline.embed.hunyuan import embed_texts  # noqa: E402

TEST_SET = Path("/Users/bing/Documents/minicare-v1/docs/敏宝知识库/召回测试集-种子50题.md")
MAPPING = Path("/Users/bing/Documents/minicare-v1/minicare-kb/var/kb_mapping.json")
MODEL_4B = "kinfra-text-embedding-4b"


def parse_testset(path: Path) -> list[dict]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-H]-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|", line)
        if m and not m.group(2).startswith("question"):
            kws = [p for p in re.split(r"[、，。；\s/]+", m.group(6)) if len(p) >= 2]
            items.append({"qid": m.group(1), "question": m.group(2), "key_info": kws, "gold": re.findall(r"KB-[A-H]\d+", m.group(3)), "risk": m.group(7)})
    return items


def load_chunks(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def load_db_vectors(settings) -> dict[str, list[float]]:
    """从 DB 读已有向量（0.6b，自研切块）→ {kb_id: [float]}"""
    conn = pymysql.connect(host=settings.db_host, port=settings.db_port, user=settings.db_user,
                           password=settings.db_password, database=settings.db_name, charset="utf8mb4")
    with conn.cursor() as cur:
        cur.execute("SELECT kb_id, embedding FROM knowledge_base WHERE embedding IS NOT NULL")
        rows = cur.fetchall()
    conn.close()
    emb = {}
    for kb_id, blob in rows:
        emb[kb_id] = list(struct.unpack("<1024f", blob))
    return emb


def embed_chunks(chunks: list[dict], model: str, settings) -> dict[str, list[float]]:
    texts = [c["content"][:2000] for c in chunks if not c.get("review")]
    vecs = embed_texts(texts, settings, batch_size=16, model=model)
    emb = {}
    idx = 0
    for c in chunks:
        if not c.get("review"):
            emb[c["kb_id"]] = vecs[idx]
            idx += 1
    return emb


def evaluate(emb: dict[str, list[float]], items: list[dict], settings, mapping: dict, chunks_meta: dict[str, str] | None = None, model: str | None = None) -> dict:
    """纯向量 top10 检索，评估关键信息命中 + Recall@10（若有映射）"""
    if chunks_meta is None:
        chunks_meta = {k: "" for k in emb}
    query_model = model or settings.tokenhub_embedding_model
    rows = []
    hits = 0
    has_mapping = bool(mapping)
    for it in items:
        qv = embed_texts([it["question"]], settings, model=query_model)[0]
        scored = sorted(((sum(a * b for a, b in zip(qv, vec)), kid) for kid, vec in emb.items()), reverse=True)
        top10 = [kid for _, kid in scored[:10]]
        # 关键信息命中
        hit = [kw for kw in it["key_info"] if any(kw in chunks_meta.get(k, "") for k in top10)]
        rows.append((it["qid"], hit, [k for k in it["key_info"] if k not in hit]))
        # Recall@10（gold 映射命中，仅当 mapping 可用）
        if has_mapping:
            gold_chunks = set()
            for code in it["gold"]:
                gold_chunks |= set(mapping.get(code, []))
            if gold_chunks and (gold_chunks & set(top10)):
                hits += 1
    avg = statistics.mean(len(r[1]) / max(len(r[1]) + len(r[2]), 1) for r in rows)
    full = sum(1 for r in rows if not r[2])
    return {"avg": avg, "full": full, "total": len(rows), "recall": hits / len(items) if has_mapping else None}


def main() -> None:
    settings = get_settings()
    items = parse_testset(TEST_SET)
    mapping = json.loads(MAPPING.read_text(encoding="utf-8")) if MAPPING.exists() else {}
    print(f"测试集: {len(items)} 题\n")

    results = {}

    # A: 自研 + 0.6b（DB 已有向量）
    print("组 A: 自研切块 + 0.6b（DB 向量）...")
    emb_a = load_db_vectors(settings)
    chunks_a = load_chunks(Path("/Users/bing/Documents/minicare-v1/minicare-kb/var/chunks.jsonl"))
    meta_a = {c["kb_id"]: c["content"] for c in chunks_a if not c.get("review")}
    results["A 自研+0.6b"] = evaluate(emb_a, items, settings, mapping, meta_a, model="kinfra-text-embedding-0.6b")

    # C: 自研 + 4b
    print("组 C: 自研切块 + 4b（向量化 1586 块）...")
    emb_c = embed_chunks(chunks_a, MODEL_4B, settings)
    results["C 自研+4b"] = evaluate(emb_c, items, settings, mapping, meta_a, model=MODEL_4B)

    # D: LlamaIndex + 4b
    print("组 D: LlamaIndex 切块 + 4b（向量化 1363 块）...")
    chunks_d = load_chunks(Path("/tmp/chunks-llama-all.jsonl"))
    meta_d = {c["kb_id"]: c["content"] for c in chunks_d if not c.get("review")}
    emb_d = embed_chunks(chunks_d, MODEL_4B, settings)
    results["D Llama+4b"] = evaluate(emb_d, items, settings, mapping, meta_d, model=MODEL_4B)

    print("\n=== 2×2 对比结果 ===")
    print(f"{'组':<16}{'关键信息命中':>12}{'全命中':>10}{'Recall@10':>12}")
    for name, r in results.items():
        rec = f"{r['recall']:.1%}" if r["recall"] is not None else "N/A"
        ft = f"{r['full']}/{r['total']}"
        print(f"{name:<16}{r['avg']:>11.1%}{ft:>10}{rec:>12}")


if __name__ == "__main__":
    main()
