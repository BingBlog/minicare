"""LaTeX 公式残留清洗测试"""
from kb_pipeline.preprocess.clean import clean_text


def test_strip_inline_latex():
    assert "建议" in clean_text("核心信息 $\\mathbf { 1 3 }$ 建议添加辅食")
    assert "$" not in clean_text("文本 $x^2$ 结束")


def test_strip_latex_command():
    assert clean_text("\\mathbf{13}：内容") == "：内容"


def test_no_latex_no_change():
    assert clean_text("普通中文文本，剂量 0.5 mg") == "普通中文文本，剂量 0.5 mg"
