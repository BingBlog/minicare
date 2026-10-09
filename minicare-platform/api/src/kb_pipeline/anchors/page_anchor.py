"""页码锚定：content_list.json 文本对齐 → 块级 page_idx

content_list.json 的元素含 text + page_idx（0 基页码），用块起始文本做模糊匹配
（容忍 OCR 差异：取前 20 字，允许 1 字容差）。找不到标 None（不阻塞入库）。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from ..logger import get_logger
from ..models import Chunk

log = get_logger(__name__)


def build_page_index(content_list_path: Path) -> list[tuple[str, int]]:
    """构建 (文本前 N 字, page_idx) 索引；无法解析时返回空表"""
    try:
        data = json.loads(content_list_path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning(f"[anchor] content_list 解析失败 {content_list_path.name}: {e}")
        return []
    idx: list[tuple[str, int]] = []
    for item in data:
        text = (item.get("text") or "").strip()
        page = item.get("page_idx")
        if text and page is not None:
            idx.append((re.sub(r"\s+", "", text), int(page)))
    return idx


def _fuzzy_find(needle: str, index: list[tuple[str, int]], max_dist: int = 1) -> int | None:
    """在索引中找 needle 前缀匹配（允许 max_dist 个字符差异）"""
    needle = re.sub(r"\s+", "", needle)
    if len(needle) < 8:  # 太短不可靠
        return None
    probe = needle[:20]
    for text, page in index:
        if text.startswith(probe):
            return page
        # 简单容差：比较前 15 字，允许 1 字不同
        if len(text) >= 15 and _hamming_ok(text[:15], probe[:15], max_dist):
            return page
    return None


def _hamming_ok(a: str, b: str, max_dist: int) -> bool:
    if len(a) != len(b):
        return False
    return sum(1 for x, y in zip(a, b) if x != y) <= max_dist


def anchor_chunk(chunk: Chunk, page_index: list[tuple[str, int]]) -> Chunk:
    """用块起始文本锚定页码（原地修改 page_idx）"""
    if not page_index:
        return chunk
    head = chunk.content[:60]
    page = _fuzzy_find(head, page_index)
    if page is not None:
        chunk.page_idx = page
    return chunk
