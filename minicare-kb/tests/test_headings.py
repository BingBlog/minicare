"""标题层级修复测试"""
from kb_pipeline.preprocess.headings import fix_heading_levels, heading_level


def test_fix_chinese_section_to_h2():
    md = "## 一、定义\n内容\n"
    out = fix_heading_levels(md)
    assert "## 一、定义" in out
    assert heading_level("## 一、定义") == 2


def test_fix_subsection_to_h3():
    md = "## （一）IgE介导\n内容\n"
    out = fix_heading_levels(md)
    assert "### （一）IgE介导" in out


def test_fix_numbered_to_h4_h5():
    md = "## 1. 制定背景\n## 3.1 遗传因素\n"
    out = fix_heading_levels(md)
    assert "#### 1. 制定背景" in out
    assert "##### 3.1 遗传因素" in out


def test_keep_special_headings():
    md = "## 执笔人\n## 参 考 文 献\n## 2.特殊人群：\n"
    out = fix_heading_levels(md)
    # 数字编号 "2.特殊人群" 是 h4；"执笔人/参考文献" 保持 h2
    assert "#### 2.特殊人群：" in out
    assert "## 执笔人" in out
    assert "## 参 考 文 献" in out
