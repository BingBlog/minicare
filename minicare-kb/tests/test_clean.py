"""清洗规则测试"""
from kb_pipeline.preprocess.clean import clean_text


def test_strip_sup():
    assert clean_text("剂量<sup>［1‑2］</sup>使用") == "剂量使用"


def test_strip_header_footer():
    md = """正文第一行
中华预防医学杂志 2025 年 6 月第 59 卷第 6 期　Chin J Prev Med, June 2025
·749·
正文第二行"""
    out = clean_text(md)
    assert "中华预防医学杂志" not in out
    assert "·749·" not in out
    assert "正文第一行" in out
    assert "正文第二行" in out


def test_image_ref_normalized():
    # 无 alt 的图 → 【图:无题】；有 alt 的图保留描述
    assert "【图:无题】" in clean_text("![](images/abc.jpg)\n扫码阅读电子版")
    assert "【图:扫码阅读电子版】" in clean_text("![扫码阅读电子版](images/abc.jpg)")


def test_whitespace_compressed():
    assert clean_text("  空格  压缩  \n\n\n\n下一段  ") == "空格 压缩\n\n下一段"


def test_blank_lines_collapsed():
    out = clean_text("a\n\n\n\nb")
    assert out == "a\n\nb"
