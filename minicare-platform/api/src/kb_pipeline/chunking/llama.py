"""LlamaIndex 原生切块方案（方案 A，与自研 pipeline.py 并存对比）

流程：HTML 表格转换（标准 md 表格）→ MarkdownNodeParser 按标题层级切块
→ Chunk 组装（对齐 minicare-platform/api 的 Chunk 模型，保留 header_path/source 等元数据）

与自研方案的差异：
- 自研：表格独立成块（HTML 全文）+ 超长章节按段落降级 + chunk_size 未接入
- LlamaIndex：表格转标准 md 后留在正文块内（不独立），标题路径由 MarkdownNodeParser 生成
"""
from __future__ import annotations

import re

from llama_index.core import Document
from llama_index.core.node_parser import MarkdownNodeParser

from ..config import Settings
from ..logger import get_logger
from ..models import Chunk, Document as KbDocument
from ..preprocess.tables import convert_tables
from .pipeline import _kb_id

log = get_logger(__name__)

# LlamaIndex header_path 样式："/标题/一、定义/" → 我们的 "标题/一、定义"
_HP_CLEAN = re.compile(r"^/+|/+$")


def _header_path_from_meta(meta: dict) -> str:
    hp = meta.get("header_path", "/")
    hp = _HP_CLEAN.sub("", hp)
    return hp or "未命名"


def chunk_document_llama(doc: KbDocument, md_text: str, settings: Settings) -> list[Chunk]:
    """LlamaIndex MarkdownNodeParser 切块（HTML 表格已转标准 md）"""
    from ..preprocess.headings import fix_heading_levels, infer_plain_headings

    # 0) HTML 产物兼容 + 标题层级修复（与自研一致）
    md_text = infer_plain_headings(md_text)
    md_text = fix_heading_levels(md_text)
    # 1) HTML 表格 → 标准 Markdown 表格
    md_text = convert_tables(md_text)

    parser = MarkdownNodeParser()
    nodes = parser.get_nodes_from_documents([Document(text=md_text)])

    chunks: list[Chunk] = []
    seq = 0
    for node in nodes:
        content = node.get_content().strip()
        if not content:
            continue
        header_path = _header_path_from_meta(node.metadata)
        # 标题前内容（卷首署名/摘要等）无标题归属 → 噪声，跳过
        if not header_path or header_path == "未命名":
            continue
        # 去掉块的标题前缀行（header 已进 header_path，避免重复）——保留正文
        lines = content.splitlines()
        # 块首如果是 # 标题行则剔除（MarkdownNodeParser 保留标题行）
        while lines and lines[0].lstrip().startswith("#"):
            lines.pop(0)
        body = "\n".join(lines).strip()
        if not body:
            continue
        seq += 1
        # 表格块判定：正文含标准 markdown 表格（| --- | 分隔线）且以表格为主
        is_table = "|" in body and re.search(r"^\s*\|[\s\w\u4e00-\u9fff]+(\s*\|)+$", body, re.MULTILINE) is not None
        chunks.append(
            Chunk(
                kb_id=_kb_id(doc.doc_id, seq),
                doc_id=doc.doc_id,
                title=lines[0].lstrip("# ").strip() if lines else doc.title,
                header_path=header_path,
                content=body,
                chunk_type="table" if is_table else "section",
                source=doc.source,
                evidence_level=doc.evidence_level,
                region=doc.region,
                applicable_age=doc.applicable_age,
            )
        )
    return chunks
