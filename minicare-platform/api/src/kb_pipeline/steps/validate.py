"""步骤 5 · 解析高危敏感信息复核（原「内容复核」，2026-10-09 改名）：数字缺失门禁 + 风险分级 + 关键词标注 + PDF 交叉校验

拆成独立步骤的意义（PRD-008 §6.1）：改了校验规则只需重跑本步，**不必重新切块**。
关键词在第 1 期走规则抽取（`metadata/annotate.py`），LLM 生成属第 5 期（TECH-015 §4.5）。
"""
from __future__ import annotations

from ..edits import EditStore
from ..metadata.annotate import annotate_chunk
from ..models import Chunk
from ..quality.review import STATE_PENDING, STATE_REJECTED, hit_patterns
from ..validate.numbers import check_chunk
from ..validate.pdf_layer import cross_check
from . import StepContext

KEYWORD_SOURCE = "rule"     # 兜底来源标记；实际来源见 payload.keyword_stats


def run(ctx: StepContext) -> tuple[dict, dict]:
    segment_payload = ctx.upstream("segment")
    cfg = ctx.settings.validate_cfg
    pdf_path = ctx.source_pdf()

    # 人工规则例外：已被判为「误报」的条目不再重复提醒（US-06 场景 3）
    edit_store = EditStore(ctx.store.edits_root)
    exceptions = {(e.get("kb_id"), e.get("rule")) for e in edit_store.load_reviews()["rule_exceptions"]}

    chunks: list[Chunk] = []
    review_items: list[dict] = []
    excluded_count = 0
    skipped_exceptions = 0
    for raw in segment_payload.get("chunks", []):
        chunk = Chunk.from_dict(raw)
        if chunk.excluded:
            # 已屏蔽的块不参与检索，因此**不做数字门禁也不抽关键词** ——
            # 否则参考文献块里偶发的「为 次」会污染复核清单，让人去核对不该进库的内容。
            excluded_count += 1
            chunks.append(chunk)
            continue
        if cfg.enabled:
            check_chunk(chunk, ctx.settings)
        annotate_chunk(chunk, ctx.settings)
        if chunk.review:
            hits = hit_patterns(chunk.content, ctx.settings)
            chunk.review_patterns = hits
            # 全部命中模式都被判过误报 → 视为已处理，不再提醒
            if hits and all((chunk.kb_id, name) in exceptions for name in hits):
                chunk.review = False
                chunk.review_reason = None
                chunk.review_state = STATE_REJECTED
                skipped_exceptions += 1
            else:
                candidates: list[str] = []
                if cfg.pypdf_cross_check:
                    candidates = cross_check(chunk, pdf_path)
                review_items.append(
                    {
                        "kb_id": chunk.kb_id,
                        "title": chunk.title,
                        "header_path": chunk.header_path,
                        "page_idx": chunk.page_idx,
                        "reason": chunk.review_reason,
                        "patterns": hits,
                        "candidates": candidates,
                        "resolvable": bool(candidates),
                        "review_state": chunk.review_state or STATE_PENDING,
                    }
                )
        chunks.append(chunk)

    # ── 关键词抽取（US-09）：LLM 主路径 + 规则降级 + 内容级缓存 ──
    kw_payload, kw_stats = _extract_keywords(ctx, chunks)
    for c in chunks:
        if c.kb_id in kw_payload:
            c.keywords = kw_payload[c.kb_id]

    by_risk: dict[str, int] = {}
    for c in chunks:
        by_risk[c.risk_level] = by_risk.get(c.risk_level, 0) + 1

    payload = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "keyword_source": kw_stats.get("dominant_source", KEYWORD_SOURCE),
        "keyword_stats": kw_stats,
        "chunks": [c.to_dict() for c in chunks],
        "review_items": review_items,
        "excluded_count": excluded_count,
        "pdf_cross_check": bool(cfg.pypdf_cross_check and pdf_path is not None),
        "by_risk": by_risk,
        "warnings": list(kw_stats.get("warnings") or []),
    }
    if cfg.pypdf_cross_check and pdf_path is None:
        payload["warnings"].append("源 PDF 缺失，跳过 pypdf 交叉校验（review 条目无候选补全值）")
    if skipped_exceptions:
        payload["warnings"].append(f"{skipped_exceptions} 条命中已被判为误报，本次不再提醒")

    stats = {
        "chunks": len(chunks),
        "excluded": excluded_count,
        "review": len(review_items),
        "review_resolvable": sum(1 for r in review_items if r["resolvable"]),
        "rule_exceptions": skipped_exceptions,
        "keywords_llm": kw_stats.get("llm", 0),
        "keywords_rule": kw_stats.get("rule", 0),
        "keywords_cached": kw_stats.get("cache", 0),
        "emergency": by_risk.get("emergency", 0),
        "caution": by_risk.get("caution", 0),
        "pdf_available": pdf_path is not None,
    }
    return payload, stats


def _extract_keywords(ctx: StepContext, chunks: list[Chunk]) -> tuple[dict, dict]:
    """走关键词网关；网关内部已处理 LLM 失败/预算超限的降级。

    逐块进度（「关键词抽取 45/120」）写进运行登记表 —— 全量重抽时每块一次 LLM
    调用（数秒级），这是 validate 最常见的分钟级耗时来源，界面要能看到推进。
    """
    from .. import run_registry

    def _tick(text: str) -> None:
        run_registry.set_substep(ctx.doc_id, text)

    try:
        from ..keywords import KeywordGateway

        gateway = KeywordGateway(ctx.db, ctx.settings)
        payload = [c.to_dict() for c in chunks]
        result, stats = gateway.extract(payload, progress=_tick)
        llm, rule = stats.get("llm", 0), stats.get("rule", 0)
        stats["dominant_source"] = "llm" if llm >= rule and llm > 0 else "rule"
        return result, stats
    except Exception as e:      # noqa: BLE001 - 网关异常降级为逐块规则抽取
        from ..keywords import rule_keywords

        return ({c.kb_id: ",".join(rule_keywords(c.title, c.content)) for c in chunks},
                {"llm": 0, "rule": len(chunks), "cache": 0, "dominant_source": "rule",
                 "warnings": [f"关键词网关异常，全量降级为规则抽取：{e}"]})
