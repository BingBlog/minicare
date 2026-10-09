"""步骤 7 · 翻译：块级双语对（TECH-019 阶段 A）

- 输入 = validate 产物 + 人工产物（与 index **同源装配**，见 steps/finalize.py）
- 输出 = translate.json（原文不动；译文旁挂，块级 1:1）
- 干跑照常翻译（无库副作用）；LLM/预算失败降级不阻塞（步骤仍 succeeded + warnings）
- 跳过规则：被屏蔽块（默认）、中文/空块（CJK 占比 ≥ translate.skip_cjk_ratio）
"""
from __future__ import annotations

from ..glossary import glossary_hash, load_glossary, match_terms
from ..translation import TranslationGateway, detect_lang
from . import StepContext
from .finalize import chunk_src_hash, finalize_chunks


def run(ctx: StepContext) -> tuple[dict, dict]:
    validate_payload = ctx.upstream("validate")
    cfg = ctx.settings.translate_cfg

    raw_chunks, _edit_stats, _review_stats = finalize_chunks(
        ctx.store, validate_payload, ctx.settings
    )
    terms = load_glossary(cfg.glossary_path)

    counts = {"total": len(raw_chunks), "translated": 0, "cached": 0, "skipped_zh": 0,
              "skipped_excluded": 0, "skipped_disabled": 0, "failed": 0}
    warnings: list[str] = []
    items: dict[str, dict] = {}
    units: list[dict] = []
    gstats: dict = {"warnings": [], "calls": 0, "tokens_in": 0, "tokens_out": 0}

    if not cfg.enabled:
        warnings.append("翻译已在配置中禁用（translate.enabled=false），本步为空跑")
        for c in raw_chunks:
            items[c["kb_id"]] = {"status": "skipped_disabled", "lang": ""}
            counts["skipped_disabled"] += 1
    else:
        for c in raw_chunks:
            kb_id = c["kb_id"]
            text = f"{c.get('title', '')}\n{c.get('content', '')}"
            lang = detect_lang(text, cfg.skip_cjk_ratio)
            if (c.get("excluded") or c.get("disabled")) and not cfg.translate_excluded:
                items[kb_id] = {"status": "skipped_excluded", "lang": lang}
                counts["skipped_excluded"] += 1
                continue
            if lang in ("zh", "empty"):
                items[kb_id] = {"status": "skipped_zh", "lang": lang}
                counts["skipped_zh"] += 1
                continue
            hits = match_terms(text, terms, cfg.max_glossary_hits)
            units.append({
                "kb_id": kb_id, "title": c.get("title", ""), "content": c.get("content", ""),
                "terms": hits, "src_hash": chunk_src_hash(c),
            })

        gateway = TranslationGateway(ctx.db, ctx.settings)

        # 子进度上报（分钟级步骤的可见性，同 validate 的「关键词抽取 x/y」）
        from .. import run_registry

        def _tick(text: str) -> None:
            run_registry.set_substep(ctx.doc_id, text)

        results, gstats = gateway.translate_chunks(units, progress=_tick)
        for u in units:
            kb_id = u["kb_id"]
            r = results.get(kb_id)
            base = {"lang": "en", "src_hash": u["src_hash"],
                    "glossary_hit": [t.en for t in u["terms"]]}
            if r and r.zh:
                items[kb_id] = {**base, "status": "translated", "quality": "mt",
                                "zh": r.zh, "title_zh": r.title_zh}
                counts["translated"] += 1
                if r.cached:
                    counts["cached"] += 1
            else:
                items[kb_id] = {**base, "status": "failed",
                                "error": (r.error if r else "no_result")}
                counts["failed"] += 1
        warnings.extend(gstats.get("warnings") or [])

    # payload 只放**内容相关**字段（items + counts 的稳定子集）—— 运行态统计（cached 命中数、
    # 实际 token 用量）只进 manifest stats：否则"内容没变、只是这次多命中了几次缓存"也会
    # 改变 artifact_hash、把下游误标 stale，违背内容寻址语义（2026-10-09 实测教训）。
    payload = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "model": ctx.settings.kb_llm_model,
        "prompt_version": cfg.prompt_version,
        "glossary_version": glossary_hash(terms),
        "counts": {k: v for k, v in counts.items() if k != "cached"},
        "items": items,
        "warnings": warnings,
    }
    stats = {
        **counts,
        "calls": gstats.get("calls", 0),
        "tokens_in": gstats.get("tokens_in", 0),
        "tokens_out": gstats.get("tokens_out", 0),
        "glossary_terms": len(terms),
    }
    return payload, stats
