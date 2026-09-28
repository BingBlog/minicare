"""切块：LlamaIndex NodeParser 编排（Markdown → Element → Hierarchical）

依赖 llama-index-core 的 node_parser 子模块（不引入索引/向量库）。
由于 MinerU md 的表格是 HTML 单行 <table>…</table>，MarkdownElementNodeParser
的"元素级"解析对我们不可用（它不是标准 md 表格语法），因此实现策略：
  1) 先把 <table> 块从 md 中抽出，替换为占位标记（表格独立成块）
  2) 对剩余文本用 MarkdownNodeParser 按标题切
  3) 组装 Chunk（表格块 = 摘要 + HTML；正文块按标题路径）
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..config import Settings
from ..logger import get_logger
from ..models import Chunk, Document

log = get_logger(__name__)

TABLE_BLOCK_RE = re.compile(r"<table>.*?</table>", re.DOTALL)
# 带索引的占位符，切块后按索引找回表格
_TABLE_PH = re.compile(r"\[\[TABLE_(\d+)\]\]")


@dataclass
class RawSection:
    level: int
    title: str
    lines: list[str]
    header_path: str


def _extract_tables(md_text: str) -> tuple[str, list[str]]:
    """抽出 <table> 块 → (去掉表格的文本, [表格 HTML])，占位符带索引"""
    tables: list[str] = []

    def _repl(m: re.Match) -> str:
        idx = len(tables)
        tables.append(m.group(0))
        return f"[[TABLE_{idx}]]"

    text = TABLE_BLOCK_RE.sub(_repl, md_text)
    return text, tables


def _split_sections(md_text: str) -> list[RawSection]:
    """按标题切块（基于修复后的层级 #/##/###…），维护标题路径"""
    sections: list[RawSection] = []
    path_stack: list[str] = []  # 各级当前标题
    cur: RawSection | None = None

    for line in md_text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            # 更新路径栈
            path_stack = path_stack[: level - 1] + [title]
            header_path = "/".join(path_stack)
            cur = RawSection(level=level, title=title, lines=[], header_path=header_path)
            sections.append(cur)
        else:
            if cur is not None:
                cur.lines.append(line)
            # 标题前的内容（摘要区）忽略
    return sections


def _kb_id(doc_id: str, seq: int) -> str:
    """幂等 kb_id：doc_id 截断到 24 位 + 序号，总长 ≤32（VARCHAR(32) 唯一键约束）"""
    return f"{doc_id[:24]}-{seq}"


def chunk_document(doc: Document, md_text: str, settings: Settings) -> list[Chunk]:
    """把一份文档的 md 切为 Chunk 列表（含表格独立块）"""
    from ..preprocess.headings import fix_heading_levels, infer_plain_headings

    # 0) HTML 产物兼容：为无 # 前缀的编号短行补标题标记
    md_text = infer_plain_headings(md_text)
    # 1) 标题层级修复（MinerU 扁平化）
    md_fixed = fix_heading_levels(md_text)
    # 2) 抽表格
    md_no_table, tables = _extract_tables(md_fixed)
    # 3) 标题切块
    sections = _split_sections(md_no_table)

    chunks: list[Chunk] = []
    seq = 0
    table_seq = 0

    # 先扫出含表格占位符的章节 → 从正文删除占位符行，记录 (section, [table_idx])
    table_hits: list[tuple[RawSection, list[int]]] = []
    for sec in sections:
        joined = "\n".join(sec.lines)
        idxs = [int(m.group(1)) for m in _TABLE_PH.finditer(joined)]
        if idxs:
            table_hits.append((sec, idxs))
            sec.lines = [ln for ln in sec.lines if not _TABLE_PH.search(ln)]

    for sec in sections:
        content = "\n".join(ln for ln in sec.lines if ln.strip()).strip()
        if not content:
            continue
        # 超长章节：按段落降级切分（简单实现，保持语义单元）
        if len(content) > settings.chunk_cfg.max_section_chars:
            for part in _split_long(content, settings):
                seq += 1
                chunks.append(
                    _make_chunk(doc, sec, part, "section", _kb_id(doc.doc_id, seq), settings)
                )
        else:
            seq += 1
            chunks.append(
                _make_chunk(doc, sec, content, "section", _kb_id(doc.doc_id, seq), settings)
            )

    # 表格块：按占位符索引取回 HTML，独立成 Chunk（表格摘要本期先置空，M3 生成）
    for sec, idxs in table_hits:
        for idx in idxs:
            if idx >= len(tables):
                continue
            seq += 1
            table_seq += 1
            chunks.append(
                _make_chunk(
                    doc,
                    sec,
                    tables[idx],
                    "table",
                    _kb_id(doc.doc_id, seq),
                    settings,
                    table_no=table_seq,
                )
            )

    # 排序：按标题路径稳定排序（表格块归属章节内）
    chunks.sort(key=lambda c: (c.header_path, c.chunk_type != "section"))
    return chunks


def _make_chunk(
    doc: Document,
    sec: RawSection,
    content: str,
    chunk_type: str,
    kb_id: str,
    settings: Settings,
    table_no: int = 0,
) -> Chunk:
    title = f"表{table_no} {sec.title}" if chunk_type == "table" else sec.title
    return Chunk(
        kb_id=kb_id,
        doc_id=doc.doc_id,
        title=title,
        header_path=sec.header_path,
        parent_kb_id=None,  # M2 父子树：父块 = 上一级章节（后续用 header_path 派生）
        content=content,
        chunk_type=chunk_type,
        source=doc.source,
        evidence_level=doc.evidence_level,
        region=doc.region,
        applicable_age=doc.applicable_age,
    )


def _split_long(content: str, settings: Settings) -> list[str]:
    """超长章节降级切分：按空行段落聚合到 ≤max_section_chars"""
    paras = [p.strip() for p in content.split("\n\n") if p.strip()]
    parts: list[str] = []
    cur = ""
    for p in paras:
        if len(cur) + len(p) > settings.chunk_cfg.max_section_chars and cur:
            parts.append(cur)
            cur = p
        else:
            cur = (cur + "\n\n" + p) if cur else p
    if cur:
        parts.append(cur)
    return parts
