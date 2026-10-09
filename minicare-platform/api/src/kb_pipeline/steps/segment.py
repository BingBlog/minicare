"""步骤 4 · 切块：自研章节切块（表格独立成块）+ 页码锚定 + 噪声块判定

复用 `chunking/pipeline.py`（生产路径，零运行时依赖）与 `anchors/page_anchor.py`。
**不自研第二套切块实现**，只做输入装配与产物落盘。

噪声块判定（US-07）放在这里而不是独立的第 7 步：它本质是"切块结果的质量分类"，
与块的边界强相关；独立成步会让"改噪声规则"和"改切块参数"产生相同的失效范围，
反而失去拆分的意义。
"""
from __future__ import annotations

from pathlib import Path

from ..anchors.page_anchor import anchor_chunk, build_page_index
from ..chunking.pipeline import chunk_document
from ..logger import get_logger
from ..models import Document
from ..quality.noise import apply_overrides, detect, load_overrides
from . import StepContext

log = get_logger(__name__)


def _build_document(ctx: StepContext, parse_payload: dict) -> Document:
    """装配 Document：**优先用台账字段（US-02）**，台账没有时回落到老的文件名映射表"""
    mapping = ctx.settings.metadata_cfg.doc_mapping.get(ctx.doc_id, [ctx.doc_id, "guideline", ""])
    source, evidence, age = mapping[0], mapping[1], (mapping[2] if len(mapping) > 2 else "")
    region = ctx.region

    if ctx.db is not None:
        try:
            from ..corpus import CorpusLedger

            row = CorpusLedger(ctx.db).get(ctx.doc_id)
            if row:
                source = row.get("source_name") or source
                evidence = row.get("evidence_level") or evidence
                age = row.get("applicable_age") or age
                region = row.get("region") or region
        except Exception as e:  # noqa: BLE001 - 台账不可用不应阻断切块
            log.warning(f"[segment] 读取台账失败，回落到文件名映射表: {e}")

    return Document(
        doc_id=ctx.doc_id,
        title=parse_payload.get("md_name", ctx.doc_id),
        source=source,
        region=region,
        md_path=Path(parse_payload["md_path"]),
        content_list_path=Path(parse_payload["content_list_path"]) if parse_payload.get("content_list_path") else None,
        pdf_path=ctx.source_pdf(),
        evidence_level=evidence,
        applicable_age=age or None,
    )


def run(ctx: StepContext) -> tuple[dict, dict]:
    parse_payload = ctx.upstream("parse")
    normalize_payload = ctx.upstream("normalize")

    doc = _build_document(ctx, parse_payload)
    chunks = chunk_document(doc, normalize_payload["md"], ctx.settings)

    page_index: list[tuple[str, int]] = []
    cl_path = normalize_payload.get("content_list_path")
    if cl_path and Path(cl_path).exists():
        page_index = build_page_index(Path(cl_path))
    anchored = 0
    for c in chunks:
        anchor_chunk(c, page_index)
        if c.page_idx is not None:
            anchored += 1

    by_type: dict[str, int] = {}
    for c in chunks:
        by_type[c.chunk_type] = by_type.get(c.chunk_type, 0) + 1

    # ── 噪声块判定（US-07）：默认屏蔽 + 人工优先于规则 ──
    warnings: list[str] = []
    overrides = load_overrides(ctx.store.edits_root)
    excluded_summary: dict[str, int] = {}
    if ctx.settings.noise_cfg.exclude_default:
        verdicts = apply_overrides(detect(chunks, ctx.settings.noise_cfg), overrides)
        for c in chunks:
            v = verdicts.get(c.kb_id)
            if v and v.excluded:
                c.excluded = True
                c.exclude_rule = v.rule
                c.exclude_reason = v.reason
                c.exclude_by = v.by
            elif v and v.by == "manual_restore":
                c.exclude_by = v.by        # 留痕：此块曾被规则命中但人工恢复了
            if c.excluded:
                excluded_summary[c.exclude_rule or "unknown"] = (
                    excluded_summary.get(c.exclude_rule or "unknown", 0) + 1
                )
        if excluded_summary:
            warnings.append(
                "已屏蔽 " + str(sum(excluded_summary.values())) + " 块不参与检索："
                + "、".join(f"{k}×{v}" for k, v in excluded_summary.items())
            )
        restored = [kb for kb, v in verdicts.items() if v.by == "manual_restore" and kb in set(overrides.get("restore") or [])]
        if restored:
            warnings.append(f"人工已恢复 {len(restored)} 块（人工决定优先于规则）")

    payload = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "chunks": [c.to_dict() for c in chunks],
        "page_index_size": len(page_index),
        "by_type": by_type,
        "excluded_summary": excluded_summary,
        "warnings": warnings,
    }
    stats = {
        "chunks": len(chunks),
        "sections": by_type.get("section", 0),
        "tables": by_type.get("table", 0),
        "anchored": anchored,
        "excluded": sum(excluded_summary.values()),
    }
    return payload, stats
