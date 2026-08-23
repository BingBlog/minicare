"""HTML 产物无前缀标题识别测试"""
from kb_pipeline.preprocess.headings import infer_plain_headings


def test_infer_chinese_section():
    md = "一、服务对象\n辖区内常住婴幼儿\n二、服务内容\n评估要点"
    out = infer_plain_headings(md)
    assert "## 一、服务对象" in out
    assert "## 二、服务内容" in out


def test_infer_subsection_and_number():
    md = "（1）喂养行为评价\n内容\n1.2 相关因素\n内容"
    out = infer_plain_headings(md)
    assert "### （1）喂养行为评价" in out
    assert "#### 1.2 相关因素" in out


def test_not_match_body_sentence():
    # 长句/含标点不识别
    md = "针对满月、3月龄婴儿，重点询问养育人是否纯母乳喂养。\n这是第二段正文内容，包含完整句号。"
    out = infer_plain_headings(md)
    assert "## " not in out


def test_plain_number_heading():
    md = "2.满6月龄至满24月龄\n内容"
    out = infer_plain_headings(md)
    assert "## 2.满6月龄至满24月龄" in out
