"""pypdf 文字层交叉校验：review 命中块的缺失数字，在原 PDF 文字层中定位候选补全值

原理：pypdf 提取原 PDF 文字层数字 100% 完整（已实测），可作为"真值"对照，
输出建议补全值 → 人工确认后回填（M3 做自动回填）。
"""
from __future__ import annotations

import re
from pathlib import Path

from ..models import Chunk
from ..logger import get_logger

log = get_logger(__name__)

# 从块中提取"缺失处前后文"：取命中模式前 20 字 + 后 10 字
_CONTEXT_WINDOW = 30


def _load_pdf_text(pdf_path: Path) -> str:
    """提取 PDF 文字层（压缩空白）"""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(pdf_path))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:  # 单页失败不中断
                continue
        return re.sub(r"\s+", "", "\n".join(parts))
    except Exception as e:
        log.warning(f"[validate] pypdf 读取失败 {pdf_path.name}: {e}")
        return ""


def cross_check(chunk: Chunk, pdf_path: Path | None) -> list[str]:
    """对 review 块在原 PDF 文字层定位候选值；返回候选列表（可能为空）"""
    if not pdf_path or not chunk.review_reason:
        return []
    pdf_flat = _load_pdf_text(pdf_path)
    if not pdf_flat:
        return []
    # 用块中命中模式周边文本做锚点：取 review_reason 中的模式在 content 中的位置
    content_flat = re.sub(r"\s+", "", chunk.content)
    candidates: list[str] = []
    for name, pat in [
        ("为 次", r"为\s*次"),
        ("为 ∶ 肾上腺素", r"为\s*[∶:]\s*肾上腺素"),
        ("最大剂量 ", r"最大剂量\s*[，。]"),
        ("重复注射 次", r"重复注射\s*次"),
        ("（ 岁）", r"（\s*岁）"),
        ("每次 ，", r"每次\s*[，,]"),
        ("需要 剂以上", r"需要\s*剂以上"),
    ]:
        if name not in (chunk.review_reason or ""):
            continue
        m = re.search(pat, content_flat)
        if not m:
            continue
        # 取缺失点前的锚文本（去掉模式本身）
        anchor = content_flat[max(0, m.start() - 25) : m.start()]
        # 在 PDF 文字层找锚文本，取其后的数字
        pos = pdf_flat.find(anchor[-15:])
        if pos >= 0:
            tail = pdf_flat[pos + len(anchor[-15:]) : pos + len(anchor[-15:]) + 30]
            num = re.match(r"[\d\.\~\-∶:／/%]+\s*(ml|mg|kg|h|次|岁|剂|%)?", tail)
            if num:
                candidates.append(f"{name} → 候选: {num.group(0)}")
    return candidates
