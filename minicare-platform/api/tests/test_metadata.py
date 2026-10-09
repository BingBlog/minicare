"""元数据标注测试"""
from kb_pipeline.metadata.annotate import annotate_chunk


def test_keywords_from_title(plain_chunk, settings):
    plain_chunk.title = "严重过敏反应治疗与预防"
    annotate_chunk(plain_chunk, settings)
    assert plain_chunk.keywords
    assert "严重过敏反应" in plain_chunk.keywords


def test_risk_emergency(plain_chunk, settings):
    plain_chunk.content = "出现心跳呼吸骤停，立即就地心肺复苏"
    annotate_chunk(plain_chunk, settings)
    assert plain_chunk.risk_level == "emergency"


def test_risk_caution(plain_chunk, settings):
    plain_chunk.content = "肾上腺素是首选急救药物，需监测血压"
    annotate_chunk(plain_chunk, settings)
    assert plain_chunk.risk_level == "caution"


def test_risk_low_default(plain_chunk, settings):
    plain_chunk.content = "合理喂养，均衡营养"
    annotate_chunk(plain_chunk, settings)
    assert plain_chunk.risk_level == "low"
