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


def test_image_ref_keeps_path():
    """⚠️ 图片引用必须**保留路径**（只补缺省 alt）。

    v2 及更早把它压成 `【图:无题】`，路径一丢前端就再也渲染不出图（2026-10-05 用户报障）。
    """
    assert clean_text("![](images/abc.jpg)\n扫码阅读电子版") == "![图](images/abc.jpg)\n扫码阅读电子版"
    # 有 alt（图注）的原样保留 —— 图注仍留在正文里可被检索
    assert clean_text("![扫码阅读电子版](images/abc.jpg)") == "![扫码阅读电子版](images/abc.jpg)"


def test_whitespace_compressed():
    assert clean_text("  空格  压缩  \n\n\n\n下一段  ") == "空格 压缩\n\n下一段"


def test_blank_lines_collapsed():
    out = clean_text("a\n\n\n\nb")
    assert out == "a\n\nb"


def test_header_does_not_eat_reference_entries():
    """⚠️ 2026-10-09 回归（normalize@v4）：页眉规则曾把参考文献条目"断头"。

    原版 `^\\s*(中华[^。\\n]*杂志|…)` 的两个毛病：
      · `^\\s*` 的 `\\s` 含换行 → 匹配吞掉前一个空行的换行，line_map 行号坐标系漂移
        （《共识》文档实测 311 行里 106 行对照错位，界面出现成片"幻影增删"）；
      · 贪婪 `[^。\\n]*` 吃到行内最后一个"杂志" → 以编辑部名义开头、行内又引期刊名的
        条目被整段断头（真实误伤 3 条文献，只剩尾段如「，2019（3）：164-171.」）。

    样例逐字来自《2025_婴幼儿过敏性疾病预防健康教育专家共识》的 raw md。
    """
    cases = [
        "中华儿科杂志编辑委员会，中华医学会儿科学分会.[\u00a0\u00a01\u00a0\u00a0]儿童过敏性疾病诊断及治疗专家共识[J]. 中华儿科杂志，2019（3）：164-171.",
        "中华医学会儿科学分会新生儿学组，中华儿科杂志编[22]辑委员会. 新生儿牛奶蛋白过敏诊断与管理专家共识（2023）[J]. 中华儿科杂志",
        "中华医学会妇产科学分会产科学组. 孕前和孕期保健[26]指南（2018）[J]. 中华妇产科杂志",
    ]
    for line in cases:
        assert clean_text(line) == line


def test_header_removal_keeps_line_structure():
    """页眉只删行内容、**不吞换行** —— 行结构一变，line_map 的行号链就会与原始 md 脱钩。

    （守卫在 clean_text_with_map 内部；这里验证行为本身。）
    """
    md = "前文\n\n中华预防医学杂志 2025 年 6 月第 59 卷第 6 期\n\n后文"
    out = clean_text(md)
    assert "中华预防医学杂志" not in out
    assert len(out.splitlines()) == len(md.splitlines()) == 5
