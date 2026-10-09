"""数字缺失检测：9 类模式扫描 → 命中标 review（医疗安全门禁）

经验：MinerU vlm 引擎对双栏医学期刊剂量数字识别不稳定（丢 0.5mg/次、25% 等）；
pipeline 引擎基本保真（实测每文档 0-2 处真缺失）。此门禁兜底，命中条目不进检索。
"""
from __future__ import annotations

import re

from ..config import Settings
from ..models import Chunk

# 命中任一 → review=True
_MISSING_PATTERNS: list[tuple[str, re.Pattern]] = []


def _compile_patterns(settings: Settings) -> None:
    global _MISSING_PATTERNS
    if _MISSING_PATTERNS:
        return
    _MISSING_PATTERNS = [
        (name, re.compile(pat)) for name, pat in settings.validate_cfg.patterns.items()
    ]


def scan_missing_numbers(text: str, settings: Settings) -> list[str]:
    """返回命中的缺失模式名列表（空 = 通过）"""
    _compile_patterns(settings)
    hits = []
    for name, pat in _MISSING_PATTERNS:
        if pat.search(text):
            hits.append(name)
    return hits


def check_chunk(chunk: Chunk, settings: Settings) -> Chunk:
    """对单个 Chunk 做数字校验，命中则标记 review（原地修改并返回）"""
    hits = scan_missing_numbers(chunk.content, settings)
    if hits:
        chunk.review = True
        chunk.review_reason = "数字缺失: " + ", ".join(hits)
        if chunk.risk_level == "low":
            chunk.risk_level = "caution"
    return chunk


def apply_risk_keywords(chunk: Chunk, settings: Settings) -> Chunk:
    """风险分级：按内容关键词升 caution/emergency（在元数据标注后调用）"""
    if chunk.review:
        return chunk  # 已 review 的保持 caution
    for kw in settings.validate_cfg.risk_emergency_keywords:
        if kw in chunk.content:
            chunk.risk_level = "emergency"
            return chunk
    for kw in settings.validate_cfg.risk_caution_keywords:
        if kw in chunk.content:
            if chunk.risk_level == "low":
                chunk.risk_level = "caution"
            return chunk
    return chunk
