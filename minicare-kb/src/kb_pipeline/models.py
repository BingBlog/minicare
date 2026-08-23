"""核心数据模型（文档层 / 块层）"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Document:
    """一份已解析的源文档（MinerU 产物目录）"""

    doc_id: str               # 稳定 ID：文件名（去掉扩展名），幂等依据
    title: str                # md 一级标题
    source: str               # 指南/文章名（入库 source 字段）
    region: str               # cn / intl
    md_path: Path             # <文档名>.md
    content_list_path: Path | None = None  # *_content_list.json
    pdf_path: Path | None = None     # 原 PDF（数字交叉校验用）
    evidence_level: str = "guideline"
    source_url: str | None = None
    applicable_age: str | None = None


@dataclass
class Chunk:
    """知识条目块（chunks.jsonl 一行一条，入库到 knowledge_base）"""

    kb_id: str                       # 幂等键：{doc_id}-{seq}
    doc_id: str
    title: str                       # 块标题
    header_path: str                 # 标题路径，如 "九、严重过敏反应治疗/（二）主要治疗药物"
    content: str                     # 清洗后文本（表格块 = LLM 摘要 + 表格 HTML）
    chunk_type: str                  # section / table / image / paragraph
    parent_kb_id: str | None = None  # 父子树父块
    page_idx: int | None = None      # 页码锚定（content_list 对齐）
    source: str = ""
    evidence_level: str = "guideline"
    region: str = "cn"
    risk_level: str = "low"          # low / caution / emergency
    applicable_age: str | None = None
    review: bool = False             # True = 数字校验未过，不入检索
    review_reason: str | None = None
    keywords: str | None = None      # 逗号分隔关键词（FULLTEXT 用）
    embedding: bytes | None = None   # 生成后回填（float32）

    def to_dict(self) -> dict:
        d = {
            "kb_id": self.kb_id,
            "doc_id": self.doc_id,
            "title": self.title,
            "header_path": self.header_path,
            "parent_kb_id": self.parent_kb_id,
            "content": self.content,
            "chunk_type": self.chunk_type,
            "page_idx": self.page_idx,
            "source": self.source,
            "evidence_level": self.evidence_level,
            "region": self.region,
            "risk_level": self.risk_level,
            "applicable_age": self.applicable_age,
            "review": self.review,
            "review_reason": self.review_reason,
            "keywords": self.keywords,
        }
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Chunk":
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class ParseStats:
    """解析阶段统计（日志/断点续跑用）"""

    total: int = 0
    done: int = 0
    failed: list[str] = field(default_factory=list)
    skipped: int = 0
