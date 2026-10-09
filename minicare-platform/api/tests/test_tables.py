"""表格转换测试"""
from kb_pipeline.preprocess.tables import convert_tables, count_html_tables

SAMPLE = """<table><tr><td>受累系统</td><td>症状</td></tr><tr><td>皮肤</td><td>荨麻疹</td></tr></table>"""


def test_convert_simple_table():
    out = convert_tables(SAMPLE)
    assert "| 受累系统 | 症状 |" in out
    assert "| --- | --- |" in out
    assert "| 皮肤 | 荨麻疹 |" in out
    assert "<table>" not in out


def test_count_tables():
    md = "文本\n" + SAMPLE + "\n更多\n" + "<table><tr><td>a</td></tr></table>"
    assert count_html_tables(md) == 2


def test_preserve_surrounding_text():
    md = "前文\n\n" + SAMPLE + "\n\n后文"
    out = convert_tables(md)
    assert "前文" in out
    assert "后文" in out


def test_empty_cells():
    md = "<table><tr><td>a</td><td></td></tr></table>"
    out = convert_tables(md)
    assert "| a |  |" in out
