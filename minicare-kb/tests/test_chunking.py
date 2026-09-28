"""切块测试：标题路径 / 表格独立块 / review 传播"""
from kb_pipeline.chunking.pipeline import chunk_document
from kb_pipeline.preprocess.clean import clean_text


def test_chunk_sections(sample_doc, settings):
    md = clean_text(sample_doc.md_path.read_text(encoding="utf-8"))
    chunks = chunk_document(sample_doc, md, settings)
    # 至少 4 个章节块 + 1 个表格块
    types = [c.chunk_type for c in chunks]
    assert types.count("section") >= 4
    assert "table" in types
    # 标题路径层级（含文档一级标题前缀）
    paths = [c.header_path for c in chunks]
    assert any(p.endswith("一、定义") for p in paths)
    assert any("二、发病机制/（一）IgE介导" in p for p in paths)


def test_table_block_isolated(sample_doc, settings):
    md = clean_text(sample_doc.md_path.read_text(encoding="utf-8"))
    chunks = chunk_document(sample_doc, md, settings)
    tables = [c for c in chunks if c.chunk_type == "table"]
    assert len(tables) == 1
    assert "<table>" in tables[0].content
    assert tables[0].title.startswith("表1")
    # 表格块不带数字校验（表格 HTML 无缺失模式）——但章节内容中缺失会被标
    secs = [c for c in chunks if c.chunk_type == "section"]
    assert any("最大剂量" in c.content for c in secs)


def test_risk_keywords_apply(sample_doc, settings):
    from kb_pipeline.metadata.annotate import annotate_chunk

    md = clean_text(sample_doc.md_path.read_text(encoding="utf-8"))
    chunks = chunk_document(sample_doc, md, settings)
    for c in chunks:
        annotate_chunk(c, settings)
    # 治疗章节（section 类型）含"肾上腺素/急救" → caution/emergency；表格块不算
    treat = [c for c in chunks if "治疗" in c.header_path and c.chunk_type == "section"]
    assert treat and all(c.risk_level in ("caution", "emergency") for c in treat)
    # 定义章节无急救词 → low
    defin = [c for c in chunks if c.header_path.endswith("一、定义")]
    assert defin and defin[0].risk_level == "low"
