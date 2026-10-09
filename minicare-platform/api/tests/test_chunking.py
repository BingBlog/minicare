"""切块测试：标题路径 / 表格独立块 / review 传播 / 落盘顺序"""
from kb_pipeline.chunking.pipeline import chunk_document, doc_order_key, kb_seq
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


def test_chunks_follow_document_order(sample_doc, settings):
    """⚠️ 切块产物按**文档阅读顺序**落盘，**不能**按 `header_path` 字典序。

    2026-10-05 用户报障：产物按 header_path 排，把「切片对照」列表打成
    `Abbreviations → Abstract → Acknowledgments → Appendix A…`，页码从 1 跳到 84 再跳回 1，
    看着就像混进了别的文档。

    这条同时钉住两件事：① 章节按源行号升序；② **表格块落在它所属的章节里**
    （原来那句"按标题路径排序"就是为了这一条，现在靠行号实现，两全）。
    """
    md = clean_text(sample_doc.md_path.read_text(encoding="utf-8"))
    chunks = chunk_document(sample_doc, md, settings)

    starts = [c.line_start for c in chunks]
    assert all(s is not None for s in starts), "样例 md 的表格不跨行，行号应当可用"
    assert starts == sorted(starts), f"落盘顺序不是文档顺序：{starts}"

    table = next(c for c in chunks if c.chunk_type == "table")
    obs = next(c for c in chunks if c.title.endswith("观察"))
    assert chunks.index(table) < chunks.index(obs), "表格没留在所属章节里（被挪到文末了）"


def test_doc_order_key_falls_back_to_creation_seq():
    """旧产物没记源行号时退回 kb_id 里的**创建序号** —— 仍是文档顺序，不是字典序"""
    assert doc_order_key(5, "d-2") < doc_order_key(9, "d-1")
    assert doc_order_key(None, "d-2") < doc_order_key(None, "d-10")   # 2 在 10 前（不是字符串序）
    assert doc_order_key(3, "d-9") < doc_order_key(None, "d-1")       # 有行号的一律排前面
    # 拆分 / 合并产生的件沿用原序号
    assert kb_seq("d-12") == kb_seq("d-12s1") == kb_seq("d-12m") == 12
    assert kb_seq("看不懂的 id") == 10**9


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
