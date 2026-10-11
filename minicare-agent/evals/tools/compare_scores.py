#!/usr/bin/env python
"""双跑对照（TECH-026 §3.5 / B3）：Node judge（台账存量） vs deepeval 引擎（scores.json）。

逐 (用例 × 维度) 比较"通过方向"是否一致（engine 的 neutral 视为"非通过"，与 Node fail 同向），
输出 Markdown 对照表与一致率统计；分歧点附双方 reason 供人工复核。

用法：
    evals/.venv/bin/python evals/tools/compare_scores.py \
        --db <platform.db> --run <run_id> --scores <scores.json> [--out <compare.md>]

退出码：0 全部可比较项方向一致；2 存在分歧；1 参数/数据问题。
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


def load_node(db_path: str, run_id: str) -> dict[str, dict]:
    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(
            "SELECT case_id, judge FROM eval_case_result WHERE run_id = ?", (run_id,)
        ).fetchall()
    finally:
        conn.close()
    out: dict[str, dict] = {}
    for cid, j in rows:
        try:
            out[cid] = json.loads(j) if j else {}
        except Exception:
            out[cid] = {}
    return out


def node_reason(v: dict | None) -> str:
    if not isinstance(v, dict):
        return ""
    r = v.get("reason")
    if r:
        return str(r)
    rs = v.get("reasons")
    if isinstance(rs, list):
        return "；".join(str(x) for x in rs)
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(description="双跑对照：Node judge vs deepeval 引擎")
    ap.add_argument("--db", required=True, help="platform.db 路径")
    ap.add_argument("--run", required=True, help="run_id")
    ap.add_argument("--scores", required=True, help="引擎输出 scores.json")
    ap.add_argument("--out", default=None, help="对照报告输出（Markdown）")
    args = ap.parse_args()

    node = load_node(args.db, args.run)
    eng = json.loads(Path(args.scores).read_text(encoding="utf-8"))
    results: dict = eng.get("results") or {}
    meta = eng.get("meta") or {}

    lines: list[str] = [
        f"# 双跑对照 · {args.run}",
        "",
        f"> 引擎：{meta.get('engine')} {meta.get('deepeval')} · judge={meta.get('model')}（temperature={meta.get('temperature')}）"
        f" ｜ {meta.get('calls')} 次判定 / {meta.get('failed')} 失败 / {meta.get('elapsed_ms')}ms",
        "",
        "| 用例 | 维度 | Node judge | 引擎 verdict | 方向 |",
        "|---|---|---|---|---|",
    ]
    per_dim: dict[str, list[int]] = {}      # dim -> [agree, comparable]
    disagreements: list[str] = []
    skips = 0

    for cid, dims in sorted(results.items()):
        njudge = node.get(cid) or {}
        for dim, ev in dims.items():
            nv = njudge.get(dim)
            if isinstance(nv, dict) and nv.get("error"):
                nv = None
            node_pass = nv.get("pass") if isinstance(nv, dict) else None
            eng_err = "error" in ev
            eng_pass = ev.get("pass") if not eng_err else None
            eng_verdict = ev.get("verdict") or ("ERR" if eng_err else "?")

            if node_pass is None or eng_pass is None:
                mark = "—（不可比）"
                skips += 1
            else:
                agree = bool(node_pass) == bool(eng_pass)
                mark = "一致" if agree else "**分歧**"
                per_dim.setdefault(dim, [0, 0])
                per_dim[dim][1] += 1
                if agree:
                    per_dim[dim][0] += 1
                else:
                    disagreements.append(
                        f"- {cid} · {dim}：Node={'通过' if node_pass else '不通过'}（{node_reason(nv)[:80]}）"
                        f" ｜ 引擎={eng_verdict}（{str(ev.get('reason') or '')[:80]}）"
                    )
            lines.append(
                f"| {cid} | {dim} | {'✓ pass' if node_pass else ('✗ fail' if node_pass is not None else '—')} "
                f"| {eng_verdict} | {mark} |"
            )

    total_agree = sum(v[0] for v in per_dim.values())
    total_cmp = sum(v[1] for v in per_dim.values())
    lines += ["", "## 一致率统计", ""]
    lines.append("| 维度 | 一致 / 可比 | 一致率 |")
    lines.append("|---|---|---|")
    for dim, (a, t) in sorted(per_dim.items()):
        lines.append(f"| {dim} | {a} / {t} | {100.0 * a / t:.0f}% |")
    overall = f"{100.0 * total_agree / total_cmp:.1f}%" if total_cmp else "—"
    lines.append(f"| **合计** | **{total_agree} / {total_cmp}** | **{overall}** |")
    lines += ["", f"不可比较 {skips} 项（Node 未判 / 引擎失败 / 空数据）"]
    if disagreements:
        lines += ["", "## 分歧点（人工复核）", ""] + disagreements

    report = "\n".join(lines)
    print(report)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"\n✓ 对照报告已写入：{args.out}")
    return 2 if disagreements else 0


if __name__ == "__main__":
    raise SystemExit(main())
