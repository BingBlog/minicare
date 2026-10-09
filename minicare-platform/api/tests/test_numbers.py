"""数字缺失检测测试（含真实文档 9 处样本）"""
from kb_pipeline.models import Chunk
from kb_pipeline.validate.numbers import check_chunk, scan_missing_numbers

# 真实文档中发现的缺失（上下文对齐模式）
REAL_CASES = [
    "青少年及成人为 次，婴幼儿及儿童（ 岁）剂量可按体重计算",
    "为 ∶ 肾上腺素 ，最大剂量 ，",
    "可重复注射 次。",
    "我国仅有 严重过敏反应在发作时应用了肾上腺素进行治疗",
    "晶体液快速滴注（成人：500~1 000 ml，儿童 ，每次 ，最大 ，必要时重复）",
    "尤其是重度或急救时需要 剂以上肾上腺素的患者",
]


def test_all_real_cases_detected(settings):
    for text in REAL_CASES:
        hits = scan_missing_numbers(text, settings)
        assert hits, f"应命中缺失: {text}"


def test_clean_text_no_hits(settings):
    assert scan_missing_numbers("青少年及成人为 0.5 mg/次，单次最大剂量 0.3 mg", settings) == []


def test_check_chunk_marks_review(settings, plain_chunk):
    plain_chunk.content = "可重复注射 次。"
    check_chunk(plain_chunk, settings)
    assert plain_chunk.review is True
    assert "数字缺失" in (plain_chunk.review_reason or "")
    assert plain_chunk.risk_level == "caution"


def test_check_chunk_pass(settings, plain_chunk):
    check_chunk(plain_chunk, settings)
    assert plain_chunk.review is False
    assert plain_chunk.risk_level == "low"
