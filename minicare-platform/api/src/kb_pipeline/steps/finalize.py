"""最终块装配 & 源内容指纹（TECH-019 §3.2）

translate 与 index **必须同源**：人工产物（切片编辑 / 复核结论）不在 validate 产物里，
是在这一步才 merge 的（原逻辑内嵌在 index.py，抽出后两处共用，防止逻辑分叉）。
"""
from __future__ import annotations

from ..artifact import canonical_json, sha256_text


def finalize_chunks(store, validate_payload: dict, settings) -> tuple[list[dict], dict, dict]:
    """validate 产物 → 应用人工编辑 → 应用复核结论 → 最终块列表

    返回 (chunks, edit_stats, review_stats)；与 index 原先的内联实现**行为一致**
    （纯抽取，不改顺序、不改语义）。
    """
    from ..edits import EditStore, apply_chunk_edits
    from ..quality.review import apply_resolutions

    raw = list(validate_payload.get("chunks", []))
    edit_store = EditStore(store.edits_root)
    raw, edit_stats = apply_chunk_edits(raw, edit_store.load_chunks())
    raw, review_stats = apply_resolutions(raw, edit_store.load_reviews(), settings)
    return raw, edit_stats, review_stats


def chunk_src_hash(chunk: dict) -> str:
    """块「最终装配文本」指纹 —— 译文 src_hash / 过期检测的唯一口径"""
    return sha256_text(canonical_json({
        "title": chunk.get("title") or "",
        "content": chunk.get("content") or "",
    }))[:16]
