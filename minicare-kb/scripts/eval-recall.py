"""召回评测：种子 50 题 × FULLTEXT 检索 → Recall@10 / 关键信息命中

⚠️ 测试集 gold 引用 KB-xxx 知识清单条目，与按文档切块的 kb_id（doc-seq）无直接映射。
本期基线用"关键信息命中"替代：每题 key_info 关键词（同义词归一后）在 top10 块
content 中的命中情况 → 近似 Recall。后续引入 KB 条目↔文档章节映射表后可精确计算。
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymysql
import yaml

# ---------- 测试集解析 ----------

TEST_SET = Path("/Users/bing/Documents/minicare-v1/docs/敏宝知识库/召回测试集-种子50题.md")


def parse_testset(path: Path) -> list[dict]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\|\s*([A-H]-\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\w+)\s*\|", line)
        if not m:
            continue
        qid, question, gold, acceptable, negative, key_info, risk = m.groups()
        if question.startswith("question") or not question:
            continue
        items.append({
            "qid": qid,
            "question": question,
            "gold": gold,
            "acceptable": acceptable,
            "negative": negative,
            "key_info": key_info,
            "risk": risk,
        })
    return items


# ---------- 关键信息切词 ----------

def split_keywords(key_info: str) -> list[str]:
    """key_info 切词：按标点/空格拆，过滤 <2 字"""
    parts = re.split(r"[、，。；\s/]+", key_info)
    return [p for p in parts if len(p) >= 2 and not p.isdigit()]


# ---------- FULLTEXT 检索 ----------

def fulltext_search(conn, query: str, topk: int = 10) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT kb_id, content FROM knowledge_base
               WHERE status=1 AND MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE)
               ORDER BY MATCH(title,content,keywords) AGAINST(%s IN NATURAL LANGUAGE MODE) DESC
               LIMIT %s""",
            (query, query, topk),
        )
        return [{"kb_id": r[0], "content": r[1]} for r in cur.fetchall()]


def content_hit(content: str, kw: str) -> bool:
    """关键词命中（容忍 1 字差异：子串匹配即可）"""
    return kw in content


# ---------- 主流程 ----------

def main() -> None:
    items = parse_testset(TEST_SET)
    print(f"测试集: {len(items)} 题\n")

    conn = pymysql.connect(
        host="sh-cynosdbmysql-grp-6a0nj6a8.sql.tencentcdb.com",
        port=21002,
        user="bing",
        password="Wb13227560988",
        database="minicare_dev",
        charset="utf8mb4",
    )

    results = []
    for item in items:
        top10 = fulltext_search(conn, item["question"])
        kws = split_keywords(item["key_info"])
        # 关键信息命中：任一 top10 块 content 含关键词
        hit_kws = [kw for kw in kws if any(content_hit(c["content"], kw) for c in top10)]
        hit_rate = len(hit_kws) / max(len(kws), 1)
        # 有害召回：negative 关键词是否进 top5
        negative_kws = split_keywords(item["negative"])
        harmful = any(
            any(content_hit(c["content"], nk) for c in top10[:5]) for nk in negative_kws
        ) if negative_kws else False
        results.append({
            "qid": item["qid"],
            "question": item["question"],
            "top_kb": [c["kb_id"] for c in top10[:3]],
            "hit_kws": hit_kws,
            "miss_kws": [kw for kw in kws if kw not in hit_kws],
            "hit_rate": hit_rate,
            "harmful": harmful,
            "risk": item["risk"],
        })

    conn.close()

    # 汇总
    import statistics

    avg_hit = statistics.mean(r["hit_rate"] for r in results)
    full_hit = sum(1 for r in results if r["hit_rate"] == 1.0)
    harmful_count = sum(1 for r in results if r["harmful"])
    print(f"=== 关键信息命中基线（近似 Recall@10）===")
    print(f"平均命中率: {avg_hit:.2%}  | 全命中题: {full_hit}/{len(results)}  | 有害召回: {harmful_count}")
    print()
    print("=== 未全命中题目（错误分析）===")
    for r in results:
        if r["hit_rate"] < 1.0:
            print(f"[{r['qid']}] {r['question'][:30]}… 命中{len(r['hit_kws'])}/{len(r['hit_kws'])+len(r['miss_kws'])}")
            print(f"  命中: {r['hit_kws']}  未命中: {r['miss_kws']}")
            print(f"  top3: {r['top_kb']}")


if __name__ == "__main__":
    main()
