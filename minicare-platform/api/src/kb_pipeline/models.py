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
    # *_middle.json —— MinerU 的**内部块模型**（逐块/逐行/逐 span 的 bbox）。
    # content_list 只是它的渲染视图、粒度被合成过（参考文献合成 1 项、跨栏段落只留一栏），
    # 想要"高亮粒度跟 MinerU 一样细"就得用这份；没有时退化为按 PDF 文字层反推
    # （见 `block_regions.py`）。旧产物没有这个文件，重新解析一次即可拿到。
    middle_path: Path | None = None
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
    review_state: str | None = None       # pending/accepted/edited/rejected/unresolvable（US-06）
    review_patterns: list[str] | None = None   # 命中的数字缺失模式名
    excluded: bool = False           # True = 噪声块，不参与检索（US-07）
    exclude_rule: str | None = None  # reference_list / empty_table / page_furniture / figure_no_caption / manual
    exclude_reason: str | None = None
    exclude_by: str | None = None    # rule / manual_restore / manual_exclude
    edited: bool = False             # True = 被人工编辑过（US-05）
    disabled: bool = False           # True = 被人工禁用（保留但不检索）
    keywords: str | None = None      # 逗号分隔关键词（FULLTEXT 用）
    embedding: bytes | None = None   # 生成后回填（float32）
    # 源行号区间（半开区间，指向**归一化 md** 的行；换算回原始 md 要走 normalize 的 line_map）。
    # 为什么在切块里记：切片内容经过「去空行 + 去 sup + 重排」，已经不是原文的子串，
    # 只靠文本匹配最多命中 ~88%（实测）。记下行号才能 100% 精确地把切片锚回 content_list 块。
    # None = 行号不成立（上游行数对不上），此时界面上退化为按页码定位。
    line_start: int | None = None
    line_end: int | None = None

    @property
    def retrieval_status(self) -> str:
        """目标检索状态（迁移 021 后写入 knowledge_base.retrieval_status）

        优先级：屏蔽/禁用 > 待复核。屏蔽或禁用的块连复核都不需要（它根本不进检索）。
        """
        if self.excluded or self.disabled:
            return "excluded"
        if self.review:
            return "review"
        return "enabled"

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
            "line_start": self.line_start,
            "line_end": self.line_end,
            "source": self.source,
            "evidence_level": self.evidence_level,
            "region": self.region,
            "risk_level": self.risk_level,
            "applicable_age": self.applicable_age,
            "review": self.review,
            "review_reason": self.review_reason,
            "review_state": self.review_state,
            "review_patterns": self.review_patterns,
            "excluded": self.excluded,
            "exclude_rule": self.exclude_rule,
            "exclude_reason": self.exclude_reason,
            "exclude_by": self.exclude_by,
            "edited": self.edited,
            "disabled": self.disabled,
            "retrieval_status": self.retrieval_status,
            "keywords": self.keywords,
        }
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Chunk:
        return cls(**{k: d.get(k) for k in cls.__dataclass_fields__})


@dataclass
class ParseStats:
    """解析阶段统计（日志/断点续跑用）"""

    total: int = 0
    done: int = 0
    failed: list[str] = field(default_factory=list)
    skipped: int = 0
