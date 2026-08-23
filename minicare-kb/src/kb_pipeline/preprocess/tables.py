"""HTML 表格 → 标准 Markdown 表格转换

MinerU 输出的表格是单行 HTML（<table><tr><td>...），LlamaIndex MarkdownNodeParser
只识别标准 Markdown 表格语法（| a | b |）。此转换器把 HTML 表格转为标准 Markdown 表格，
解锁 LlamaIndex 原生切块作为可选方案（方案 A，与自研切块并存对比）。
"""
from __future__ import annotations

import re

_TABLE_RE = re.compile(r"<table>.*?</table>", re.DOTALL)
_TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.DOTALL)
_CELL_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _cell_text(html: str) -> str:
    """提取单元格纯文本并压缩空白"""
    # 保留 <sup> 内的内容但去掉标签（如 [1]），统一处理：去标签 + 压缩空白
    text = _TAG_RE.sub("", html)
    return _WS_RE.sub(" ", text).strip()


def _table_to_markdown(html: str) -> str:
    """单个 HTML 表格 → 标准 Markdown 表格"""
    rows: list[list[str]] = []
    for tr in _TR_RE.findall(html):
        cells = [_cell_text(c) for c in _CELL_RE.findall(tr)]
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    # 统一列数（补齐空列）
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]
    # 第一行作为表头，第二行分隔线，其余数据行
    header = rows[0]
    lines = ["| " + " | ".join(header) + " |"]
    lines.append("| " + " | ".join(["---"] * ncols) + " |")
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def convert_tables(md_text: str) -> str:
    """把 md 中所有 HTML 表格转为标准 Markdown 表格（保留原位置）"""
    return _TABLE_RE.sub(lambda m: _table_to_markdown(m.group(0)), md_text)


def count_html_tables(md_text: str) -> int:
    return len(_TABLE_RE.findall(md_text))
