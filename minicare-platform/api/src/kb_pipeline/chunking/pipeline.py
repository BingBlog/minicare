"""切块（自研实现，生产路径）

**不依赖 llama-index-core** —— 本模块零切块运行时依赖。
LlamaIndex 备选路径见同目录 `llama.py`（需 `pip install -e ".[splitter-llama]"`），
仅用于对齐官方生态做对比，不作为生产路径（实测 Recall 更低，见
`docs/CHUNKING-COMPARE-REPORT.md` 与 TECH-015 §4.2）。

由于 MinerU md 的表格是 HTML 单行 <table>…</table>，LlamaIndex 的
"元素级"解析对我们不可用（它不是标准 md 表格语法），因此实现策略：
  1) 先把 <table> 块从 md 中抽出，替换为占位标记（表格独立成块）
  2) 对剩余文本按标题层级切（标题层级需先修复，见 preprocess/headings.py）
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
    # (本文本行号, 行内容)。带上行号是为了给每个切片记 `line_start/line_end`，
    # 从而把切片**精确**锚回原文块（见 `models.Chunk.line_start` 的说明）。
    lines: list[tuple[int, str]]
    header_path: str
    line_start: int = 0
    line_end: int = 0


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
    """按标题切块（基于修复后的层级 #/##/###…），维护标题路径

    区间口径：`line_start` = 本节标题所在行；`line_end` = **下一个标题行**（半开），
    最后一节延伸到文末。区间含标题行本身，但切片的 `content` 不含标题（标题进 `title`）。
    """
    sections: list[RawSection] = []
    path_stack: list[str] = []  # 各级当前标题
    cur: RawSection | None = None
    all_lines = md_text.splitlines()

    for idx, line in enumerate(all_lines):
        m = re.match(r"^(#{1,6})\s+(.*?)\s*$", line)
        if m:
            if cur is not None:
                cur.line_end = idx
            level = len(m.group(1))
            title = m.group(2).strip()
            # 更新路径栈
            path_stack = path_stack[: level - 1] + [title]
            header_path = "/".join(path_stack)
            cur = RawSection(level=level, title=title, lines=[], header_path=header_path,
                             line_start=idx, line_end=idx)
            sections.append(cur)
        else:
            if cur is not None:
                cur.lines.append((idx, line))
            # 标题前的内容（摘要区）忽略
    if cur is not None:
        cur.line_end = len(all_lines)
    return sections


def _kb_id(doc_id: str, seq: int) -> str:
    """幂等 kb_id：doc_id 截断到 24 位 + 序号，总长 ≤32（VARCHAR(32) 唯一键约束）"""
    return f"{doc_id[:24]}-{seq}"


# `doc-12` / `doc-12s1`（拆分件）/ `doc-12m`（合并件）→ 创建序号 12
_KB_SEQ_RE = re.compile(r"-(\d+)(?:[a-z]*\d*)?$")


def kb_seq(kb_id: str) -> int:
    """从 kb_id 里取**创建序号**；取不到排到最后（`10**9`）

    kb_id 形如 `doc_slice-12`，拆分/合并产生的件是 `…-12s1` / `…-12m`（同一序号）。
    """
    m = _KB_SEQ_RE.search(kb_id or "")
    return int(m.group(1)) if m else 10**9


def doc_order_key(line_start: int | None, kb_id: str = "") -> tuple[bool, int, int]:
    """切片的**文档阅读顺序**排序键（吃 `Chunk.line_start` / 产物 dict 里的同名值）。

    ⚠️ **切块产物一律按这个键排，不要按 `header_path`**（2026-10-05 踩坑，见
    `docs/tech/TECH-015-kb-platform-gotchas.md` §5）：`header_path` 是**字典序**，会把
    「切片对照」页的列表排成 `Abbreviations → Abstract → Acknowledgments → Appendix A…`，
    页码从 1 跳到 84 再跳回 1 —— 读起来就像混进了别的文档。

    三级键，逐级兜底：
    1. **`line_start`** —— 有行号时它就是阅读顺序（`preprocess` 逐行保序），表格按占位符
       所在行自然落回所属章节；
    2. 行号整体不可用时（**旧产物**没记行号）退回 `kb_id` 里的**创建序号** —— 创建顺序
       也是文档顺序（章节按序，表格随后），只是表格不落在原位；
    3. 同序号（`_split_long` 切出的多个分片）再按键的稳定性保持创建顺序。
    """
    return (line_start is None, 0 if line_start is None else line_start, kb_seq(kb_id))


def chunk_document(doc: Document, md_text: str, settings: Settings) -> list[Chunk]:
    """把一份文档的 md 切为 Chunk 列表（含表格独立块）

    ⚠️ 除表格抽取外，本函数的一切改写都必须**逐行保序**（一行进一行出），否则切片上的
    `line_start/line_end` 就对不上原文，精确锚定失效。函数末尾有行数校验兜底。
    """
    from ..preprocess.headings import fix_heading_levels, infer_plain_headings

    # 0) HTML 产物兼容：为无 # 前缀的编号短行补标题标记
    md_text = infer_plain_headings(md_text)
    # 1) 标题层级修复（MinerU 扁平化）
    md_fixed = fix_heading_levels(md_text)
    # 2) 抽表格
    md_no_table, tables = _extract_tables(md_fixed)
    # 行号健全性校验：表格若跨行，占位替换会改变行数 → 行号不可信，宁可放弃（退化为按页码定位）
    lines_ok = len(md_no_table.splitlines()) == len(md_text.splitlines())
    if not lines_ok:
        log.warning(
            f"[chunk] {doc.doc_id}: 表格占用多行导致行数变化，放弃源行号（对照页退化为按页码定位）"
        )
    ln = (lambda a, b: (a, b)) if lines_ok else (lambda a, b: (None, None))

    sections = _split_sections(md_no_table)

    chunks: list[Chunk] = []
    seq = 0
    table_seq = 0

    # 先扫出含表格占位符的章节 → 从正文删除占位符行，记录 (section, [(table_idx, 行号)])
    table_hits: list[tuple[RawSection, list[tuple[int, int]]]] = []
    for sec in sections:
        hits = [(int(m.group(1)), i) for i, t in sec.lines for m in _TABLE_PH.finditer(t)]
        if hits:
            table_hits.append((sec, hits))
            sec.lines = [(i, t) for i, t in sec.lines if not _TABLE_PH.search(t)]

    for sec in sections:
        content = "\n".join(t for _, t in sec.lines if t.strip()).strip()
        if not content:
            continue
        if len(content) > settings.chunk_cfg.max_section_chars:
            for part in _split_long(content, settings):
                seq += 1
                chunks.append(
                    _make_chunk(doc, sec, part, "section", _kb_id(doc.doc_id, seq), settings,
                                line_range=ln(sec.line_start, sec.line_end))
                )
        else:
            seq += 1
            chunks.append(
                _make_chunk(doc, sec, content, "section", _kb_id(doc.doc_id, seq), settings,
                            line_range=ln(sec.line_start, sec.line_end))
            )

    # 表格块：按占位符索引取回 HTML，独立成 Chunk（表格摘要本期先置空，M3 生成）
    for sec, hits in table_hits:
        for idx, line_no in hits:
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
                    # 表格块精确到它所在的那一行（占位符原本就在这一行）
                    line_range=ln(line_no, line_no + 1),
                )
            )

    # 排序：**文档阅读顺序**（切片记的源行号）。表格块按占位符所在行参与排序，
    # 自然落回所属章节里 —— 原来那句"按标题路径排序"就是字典序，代价是整个列表失了序。
    chunks.sort(key=lambda c: doc_order_key(c.line_start, c.kb_id))
    return chunks


def _make_chunk(
    doc: Document,
    sec: RawSection,
    content: str,
    chunk_type: str,
    kb_id: str,
    settings: Settings,
    table_no: int = 0,
    line_range: tuple[int | None, int | None] = (None, None),
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
        line_start=line_range[0],
        line_end=line_range[1],
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
