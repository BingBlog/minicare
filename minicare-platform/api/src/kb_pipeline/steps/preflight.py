"""步骤 1 · 预检：逐页判定扫描页、推荐解析档位、估算耗时

替代 config.py 里手工维护的 `mineru.ocr_files` 清单（技术债 T7）。
本步骤只做**本机**计算（pypdf 抽样），不产生任何外部调用。
"""
from __future__ import annotations

from . import StepContext

SOURCE_SUFFIXES = (".pdf", ".html", ".htm")

# 解析档位 → 展示名（对齐前端 `labels.ts` 的 TIER_LABEL；预检检查项与预检页用）
TIER_LABEL = {"standard": "标准档", "unknown": "待定"}


def tier_label(tier: str) -> str:
    return TIER_LABEL.get(tier, tier)


def find_source_file(ctx: StepContext):
    """在 source_dir/{国内|国际}/ 下定位该文档的源文件"""
    base = ctx.resolved_source_dir() / ctx.region_dir
    for suffix in SOURCE_SUFFIXES:
        p = base / f"{ctx.doc_id}{suffix}"
        if p.exists():
            return p
    if base.exists():
        for f in sorted(base.iterdir()):
            if f.suffix.lower() in SOURCE_SUFFIXES and f.stem == ctx.doc_id:
                return f
    return None


def scan_pdf_pages(path, min_chars: int) -> tuple[int, list[dict], int]:
    """逐页文字层统计 → (页数, [{i, chars, scanned}], 总字符数)

    这是本步骤的**唯一实现**：`_scan_pdf` 与「预检」页的逐页明细都调它，
    免得界面重算出一份与产物不一致的数字。
    """
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[dict] = []
    total = 0
    for i, page in enumerate(reader.pages):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:  # noqa: BLE001 - 单页失败（损坏页/加密页）不应中断整篇预检
            text = ""
        n = len(text)
        total += n
        pages.append({"i": i, "chars": n, "scanned": n < min_chars})
    return len(reader.pages), pages, total


def _scan_pdf(path, min_chars: int) -> tuple[int, list[int], int]:
    """逐页统计文字层字符数 → (页数, 扫描页下标, 总字符数)（薄包装，保持旧签名）"""
    count, pages, total = scan_pdf_pages(path, min_chars)
    return count, [p["i"] for p in pages if p["scanned"]], total


def run(ctx: StepContext) -> tuple[dict, dict]:
    cfg = ctx.settings.preflight_cfg
    src = find_source_file(ctx)

    payload: dict = {
        "doc_id": ctx.doc_id,
        "region": ctx.region,
        "source_file": str(src) if src else None,
        "source_missing": src is None,
        "kind": "unknown",
        "page_count": 0,
        "scanned_pages": [],
        "scanned_ratio": 0.0,
        "text_layer_chars": 0,
        "need_ocr": False,
        "recommended_tier": "unknown",
        "tier_reason": "",
        "warnings": [],
    }

    if src is None:
        payload["tier_reason"] = "源文件缺失，无法预检（请检查 source_dir/region 是否含该文档）"
        payload["recommended_tier"] = "standard"
        payload["warnings"].append("source_missing")
        return payload, {"page_count": 0, "scanned_pages": 0, "need_ocr": False}

    suffix = src.suffix.lower()
    if suffix == ".pdf":
        payload["kind"] = "pdf"
        try:
            pages, scanned, total = _scan_pdf(src, cfg.min_text_chars_per_page)
        except Exception as e:  # noqa: BLE001 - PDF 整体不可读时降级为未知档位而非中断
            payload["warnings"].append(f"pypdf_scan_failed: {e}")
            payload["tier_reason"] = "PDF 文字层读取失败，按最保守档位处理"
            payload["recommended_tier"] = "standard"
            return payload, {"page_count": 0, "scanned_pages": 0, "need_ocr": True}
        ratio = (len(scanned) / pages) if pages else 0.0
        payload.update(
            page_count=pages,
            scanned_pages=scanned,
            scanned_ratio=round(ratio, 4),
            text_layer_chars=total,
            need_ocr=ratio > cfg.scan_page_ratio_for_ocr,
        )
    else:
        payload["kind"] = "html"
        payload["page_count"] = 1
        payload["tier_reason"] = "HTML 源文件无需 OCR 判定"
        payload["recommended_tier"] = "standard"
        return payload, {"page_count": 1, "scanned_pages": 0, "need_ocr": False}

    # 档位推荐：本项目实测结论是 MinerU pipeline 对全部语料都优于 pypdf 兜底，
    # 因此除非明确需要 OCR，否则一律 standard（见 TECH-015 §4.1）。
    payload["recommended_tier"] = "standard"
    if payload["need_ocr"]:
        payload["tier_reason"] = (
            f"扫描页占比 {payload['scanned_ratio']:.0%} > 阈值 {cfg.scan_page_ratio_for_ocr:.0%}，"
            "解析必须启用 OCR"
        )
    else:
        payload["tier_reason"] = "文字层完整，MinerU pipeline 档（低幻觉、保真）"

    stats = {
        "page_count": payload["page_count"],
        "scanned_pages": len(payload["scanned_pages"]),
        "need_ocr": payload["need_ocr"],
    }
    return payload, stats
