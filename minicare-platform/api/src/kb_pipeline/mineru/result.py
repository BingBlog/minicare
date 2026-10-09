"""MinerU 产物扫描：从产物目录构建 Document 对象"""
from __future__ import annotations

from pathlib import Path

from ..config import Settings
from ..models import Document


def scan_documents(out_dir: Path, settings: Settings) -> list[Document]:
    """扫描 minerU解析版本/{国内,国际}/<文档名>/，构建 Document 列表"""
    docs: list[Document] = []
    for region in ("国内", "国际"):
        region_dir = out_dir / region
        if not region_dir.exists():
            continue
        for doc_dir in sorted(region_dir.iterdir()):
            if not doc_dir.is_dir():
                continue
            md = next(doc_dir.glob("*.md"), None)
            if md is None:
                continue
            content_list = next(doc_dir.glob("*_content_list.json"), None)
            if content_list is not None and content_list.name.endswith("_v2.json"):
                content_list = None  # 排除 v2
            for f in doc_dir.glob("*_content_list.json"):
                if not f.name.endswith("_v2.json"):
                    content_list = f
                    break
            # MinerU 的内部块模型（比 content_list 细）：界面按它做块级高亮时更精准
            middle = next((f for f in sorted(doc_dir.glob("*_middle.json"))), None)
            doc_id = doc_dir.name
            # 元数据映射
            mapping = settings.metadata_cfg.doc_mapping.get(doc_id, [doc_id, "guideline", ""])
            source, evidence, age = mapping[0], mapping[1], (mapping[2] if len(mapping) > 2 else "")
            # 原 PDF（交叉校验用）：源文件目录同文件名
            pdf_path = None
            src_pdf = settings.source_dir / region / f"{doc_id}.pdf"
            if src_pdf.exists():
                pdf_path = src_pdf
            docs.append(
                Document(
                    doc_id=doc_id,
                    title=md.name,
                    source=source,
                    region="cn" if region == "国内" else "intl",
                    md_path=md,
                    content_list_path=content_list,
                    middle_path=middle,
                    pdf_path=pdf_path,
                    evidence_level=evidence,
                    applicable_age=age or None,
                )
            )
    return docs
