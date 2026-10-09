"""pytest fixtures：合成样例（不依赖真实 PDF/API）"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from kb_pipeline.config import Settings
from kb_pipeline.models import Chunk, Document

# 合成 md：包含章节/子节/数字缺失/表格
SAMPLE_MD = """# 严重过敏反应诊断和临床管理专家共识

## 一、定义

严重过敏反应是一种速发、危及生命、可累及全身多系统的超敏反应。

## 二、发病机制

### （一）IgE介导

过敏原特异性 IgE 与效应细胞表面的 FcεRI 结合导致 IgE 交联。

### （二）非IgE介导

1. 肥大细胞直接激活
2. 细胞因子反应

## 三、治疗

### （一）初始治疗

肾上腺素是首选急救药物，青少年及成人为 次，最大剂量 ，可重复注射 次。

<table><tr><td>临床特征</td><td>轻中度非IgE介导</td></tr><tr><td>起病时间</td><td>2~72h</td></tr></table>

### （二）观察

我国仅有 严重过敏反应在发作时应用了肾上腺素进行治疗，至少监测 4 h。
"""

# 合成 content_list.json（含 page_idx）
SAMPLE_CONTENT_LIST = [
    {"type": "text", "text": "严重过敏反应是一种速发、危及生命", "page_idx": 0},
    {"type": "text", "text": "过敏原特异性 IgE 与效应细胞表面的 FcεRI", "page_idx": 1},
    {"type": "text", "text": "肾上腺素是首选急救药物", "page_idx": 2},
    {"type": "text", "text": "我国仅有 严重过敏反应在发作时", "page_idx": 3},
]


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None)


@pytest.fixture
def sample_md() -> str:
    return SAMPLE_MD


@pytest.fixture
def sample_doc(tmp_path: Path) -> Document:
    md = tmp_path / "严重过敏反应诊断和临床管理专家共识_2025" / "严重过敏反应诊断和临床管理专家共识_2025.md"
    md.parent.mkdir(parents=True)
    md.write_text(SAMPLE_MD, encoding="utf-8")
    cl = md.parent / "xxx_content_list.json"
    cl.write_text(json.dumps(SAMPLE_CONTENT_LIST, ensure_ascii=False), encoding="utf-8")
    return Document(
        doc_id=md.parent.name,
        title="严重过敏反应诊断和临床管理专家共识",
        source="严重过敏反应诊断和临床管理专家共识(2025)",
        region="cn",
        md_path=md,
        content_list_path=cl,
        pdf_path=None,
        evidence_level="consensus",
    )


@pytest.fixture
def plain_chunk() -> Chunk:
    return Chunk(
        kb_id="t-1",
        doc_id="t",
        title="测试",
        header_path="一、测试",
        content="正常内容，没有缺失。",
        chunk_type="section",
        source="测试文档",
    )


# ── 六步编排用 fixtures（不依赖真实语料与云服务）────────────────────────


@pytest.fixture
def repo_settings() -> Settings:
    """真实仓库配置（含 pipeline.yaml），用于验证配置生效"""
    from kb_pipeline.config import load_settings

    return load_settings()


@pytest.fixture
def corpus(tmp_path: Path):
    """合成一份「源文件 + MinerU 产物」的最小语料，返回 (doc_id, source_dir, out_dir, ctx_kwargs)

    目录布局模仿真实约定：
      {source_dir}/{国内}/{doc_id}.pdf
      {out_dir}/{国内}/{doc_id}/{doc_id}.md + {uuid}_content_list.json + images/
    """
    from kb_pipeline.models import Document  # noqa: F401  (保持导入可用性)

    doc_id = "合成过敏共识_2026"
    source_dir = tmp_path / "source"
    out_dir = tmp_path / "parsed"
    region = "国内"

    md_dir = out_dir / region / doc_id
    md_dir.mkdir(parents=True)
    (md_dir / f"{doc_id}.md").write_text(SAMPLE_MD, encoding="utf-8")
    (md_dir / "11111111_content_list.json").write_text(
        json.dumps(SAMPLE_CONTENT_LIST, ensure_ascii=False), encoding="utf-8"
    )
    img = md_dir / "images"
    img.mkdir()
    (img / "tbl-1.png").write_bytes(b"\x89PNG fake")

    return {
        "doc_id": doc_id,
        "region": "cn",
        "source_dir": source_dir,
        "out_dir": out_dir,
    }


@pytest.fixture
def blank_pdf(corpus):
    """在源目录放一个「全是空白页」的 PDF → 预检应判为扫描件（need_ocr=True）"""
    from pypdf import PdfWriter

    from kb_pipeline.steps import REGION_DIRS

    d = corpus["source_dir"] / REGION_DIRS["cn"]
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{corpus['doc_id']}.pdf"
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=200, height=200)
    with open(path, "wb") as f:
        writer.write(f)
    return corpus


@pytest.fixture
def orc(repo_settings, tmp_path: Path):
    """编排器（产物根与队列都落在 tmp，绝不触碰仓库 data/）"""
    from kb_pipeline.orchestrator import Orchestrator
    from kb_pipeline.platform_db import TaskQueue

    return Orchestrator(
        repo_settings,
        data_root=tmp_path / "data",
        queue=TaskQueue(tmp_path / "platform.db"),
    )
