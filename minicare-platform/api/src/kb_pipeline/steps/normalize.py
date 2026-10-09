"""步骤 3 · 正文清洗：去噪 + 标题层级修复 → 规范化 Markdown

`preprocess/headings.py` 的两个函数都是幂等的（只重写 `## ` 开头的行 × 跳过已带 `#` 的行），
因此切块步骤再调用一次不会产生副作用 —— 这里显式归一，产物可被人直接查看与 diff。
"""
from __future__ import annotations

from pathlib import Path

from ..preprocess.clean import clean_text_with_map
from ..preprocess.headings import fix_heading_levels, infer_plain_headings
from . import StepContext


def run(ctx: StepContext) -> tuple[dict, dict]:
    parse_payload = ctx.upstream("parse")
    md_path = Path(parse_payload["md_path"])
    raw_md = md_path.read_text(encoding="utf-8")

    # 行映射：输出第 i 行 ← 原始 md 第 line_map[i] 行。
    # 两个标题函数都是逐行保序的（一行进一行出），所以这张映射一直有效到归一化产物为止。
    # 切块据此把 `line_start/line_end` 换算回原始 md 的字符区间 → 精确锚回 content_list 块。
    cleaned, line_map = clean_text_with_map(raw_md)
    normalized = fix_heading_levels(infer_plain_headings(cleaned))

    headings = [ln for ln in normalized.splitlines() if ln.lstrip().startswith("#")]
    payload = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "md": normalized,
        "md_chars": len(normalized),
        "raw_md_chars": len(raw_md),
        "heading_count": len(headings),
        "content_list_path": parse_payload.get("content_list_path"),
        "source_md_name": parse_payload.get("md_name"),
        # 行映射（长度 == normalized 的行数）。缺它则切片的行号无法换算回原文。
        "line_map": line_map,
    }
    stats = {
        "md_chars": payload["md_chars"],
        "removed_chars": max(0, len(raw_md) - len(normalized)),
        "headings": len(headings),
    }
    return payload, stats
