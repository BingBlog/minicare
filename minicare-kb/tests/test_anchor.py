"""页码锚定测试"""
from kb_pipeline.anchors.page_anchor import anchor_chunk, build_page_index


def test_build_index(sample_doc):
    idx = build_page_index(sample_doc.content_list_path)
    assert len(idx) == 4
    assert idx[0][1] == 0


def test_anchor_match(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    plain_chunk.content = "严重过敏反应是一种速发、危及生命、可累及全身多系统"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx == 0


def test_anchor_no_match(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    plain_chunk.content = "完全不相关的开头文本内容测试"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx is None


def test_anchor_fuzzy_tolerance(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    # 1 字差异（OCR 容差）
    plain_chunk.content = "严重过敏反应是一种速发、危及生命,可累及全身多系统"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx == 0
