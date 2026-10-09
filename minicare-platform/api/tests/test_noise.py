"""噪声块识别与人工恢复（US-07 / PRD §7.5）

四类规则：参考文献 / 空表 / 页眉页脚残留 / 纯图无题注。
两条硬约束：**默认屏蔽 + 人工优先于规则**。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from kb_pipeline.config import load_settings
from kb_pipeline.models import Chunk
from kb_pipeline.quality import noise


@pytest.fixture
def cfg():
    return load_settings().noise_cfg


def _chunk(kb_id: str, title: str, content: str, *, ctype="section", page=None) -> Chunk:
    return Chunk(
        kb_id=kb_id, doc_id="d", title=title, header_path=title,
        content=content, chunk_type=ctype, page_idx=page, source="测试",
    )


def _pad(text: str, n: int = 60) -> str:
    """把文本填充到超过页眉页脚阈值（表示"正常内容"）"""
    return text + "正文" * n


# ── 规则 1 · 参考文献 / 引用列表 ────────────────────────────────────────


def test_reference_list_excluded_at_tail(cfg):
    chunks = [_chunk(f"c{i}", f"第{i}节", _pad("内容")) for i in range(9)]
    chunks.append(_chunk("c-ref", "参考文献", _pad("[1] 某指南. 某杂志, 2020.")))
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["c-ref"].excluded is True
    assert verdicts["c-ref"].rule == "reference_list"
    assert verdicts["c0"].excluded is False


def test_reference_title_early_in_doc_is_kept(cfg):
    """标题叫「参考文献」但出现在文档前部 → 不判屏蔽（避免误杀正文引用说明）"""
    chunks = [_chunk("c-ref", "参考文献", _pad("如何查阅参考文献"))]
    chunks += [_chunk(f"c{i}", f"第{i}节", _pad("内容")) for i in range(9)]
    assert noise.detect(chunks, cfg)["c-ref"].excluded is False


def test_reference_english_title(cfg):
    chunks = [_chunk(f"c{i}", f"第{i}节", _pad("x")) for i in range(9)]
    chunks.append(_chunk("c-r", "References", _pad("Smith J. Allergy. 2019.")))
    assert noise.detect(chunks, cfg)["c-r"].rule == "reference_list"


def test_position_prefers_page_over_list_index(cfg):
    """位置判定必须用页码 —— 这是真实场景，也是本规则最早版本的隐藏缺陷

    `chunk_document` 按 `header_path` 排序，而「参考文献」的汉字编码小于「第N节」，
    排完序它会跑到**列表最前面**。若用列表序号判断"位于文档后部"，这条规则永远不生效。
    """
    chunks = [_chunk("c-ref", "参考文献", _pad("[1] 某指南"), page=9)]
    chunks += [_chunk(f"c{i}", f"第{i}节", _pad("正文"), page=i) for i in range(1, 9)]
    assert noise.detect(chunks, cfg)["c-ref"].excluded is True


def test_tail_rule_not_triggered_when_page_is_middle(cfg):
    """标题匹配但页码在文档中部 → 不屏蔽（位置条件不满足）"""
    chunks = [_chunk("c-ref", "参考文献", _pad("正文提到参考文献的用法"), page=4)]
    chunks += [_chunk(f"c{i}", f"第{i}节", _pad("正文"), page=i) for i in range(1, 10)]
    assert noise.detect(chunks, cfg)["c-ref"].excluded is False


def test_real_world_reference_block_at_78_percent(cfg):
    """真实数据回归：NIAID_2010_食物过敏指南 的 References 块

    实测特征：title='References'、`page_idx=104`、全文 133 页、内容 72,280 字
    （是一张横跨页 104→末页的完整参考文献表）。

    位置比 = 104/133 = **0.782**。这暴露了两件事：
      · 用**起始页**当位置信号，会系统性低估"多页大块"的位置
      · 原定 `tail_ratio=0.2`（需 ≥0.8）刚好判不到它 —— 而它正是 `KB-MAPPING.md:12`
        里被错当成 gold 标准答案的那一块
    因此阈值放宽到 0.3。本用例锁定该真实数据特征。
    """
    body_pages = [1, 20, 40, 60, 80, 100, 120, 133]
    chunks = [_chunk(f"c{p}", f"第{p}节", _pad(f"第{p}页正文"), page=p) for p in body_pages]
    ref = _chunk("n-115", "References", "Smith J. J Allergy Clin Immunol. 2010;125:S1.", page=104)
    chunks.append(ref)

    ratio = 104 / 133
    assert 1 - cfg.reference_tail_ratio <= ratio < 0.8, "阈值假设已变，请复核本用例的前提"
    assert noise.detect(chunks, cfg)["n-115"].excluded is True


# ── 规则 2 · 空表 ──────────────────────────────────────────────────────


def test_empty_table_excluded(cfg):
    chunks = [
        _chunk("t1", "表1", "<table><tr><th>指标</th><th>值</th></tr></table>", ctype="table"),
        _chunk("t2", "表2", "<table><tr><td>起病时间</td><td>2~72h</td></tr><tr><td>持续时间</td><td>数小时至数天</td></tr></table>", ctype="table"),
    ]
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["t1"].excluded is True and verdicts["t1"].rule == "empty_table"
    assert verdicts["t2"].excluded is False, "有数据行的表格不应被屏蔽"


def test_short_but_valid_table_is_kept(cfg):
    """回归：短而有效的表格不能被字符数阈值误杀

    这张 2×2 剂量表去标签后仅 **19 字**，而 PRD 原定阈值是 20 —— 会被误判为空表。
    因此空表的主判据改为「数据行数 ≤ 1」，字符数只作兜底。
    """
    short_table = _chunk(
        "t-short", "表3",
        "<table><tr><td>起病时间</td><td>2~72h</td></tr>"
        "<tr><td>持续时间</td><td>数小时至数天</td></tr></table>",
        ctype="table",
    )
    assert len(noise._norm(noise._strip_tags(short_table.content))) == 19, "样例字数已变，请复核阈值假设"
    assert noise.detect([short_table], cfg)["t-short"].excluded is False


def test_table_without_data_row_excluded_even_if_long(cfg):
    """只有表头行但文字很长 → 仍判空表（主判据是行数，不是字数）"""
    long_header_only = _chunk(
        "t-h", "表4",
        "<table><tr><th>这是一个非常长的表头单元格，用来验证行数判据优先于字符数判据</th>"
        "<th>以及第二个同样很长的表头单元格，确保去标签后的字数远超阈值</th></tr></table>",
        ctype="table",
    )
    assert noise.detect([long_header_only], cfg)["t-h"].excluded is True


# ── 规则 3 · 页眉页脚残留 ───────────────────────────────────────────────


def test_page_furniture_requires_cross_page_repeat(cfg):
    """三条件同时命中才屏蔽：短文本 + 页码形制 + 跨页重复"""
    chunks = [
        _chunk("p1", "页脚", "·354·", page=2),
        _chunk("p2", "页脚", "·354·", page=5),          # 同文本、不同页 → 重复
        _chunk("p3", "页码", "·999·", page=1),          # 只出现一次 → 不屏蔽
        _chunk("n1", "正文", _pad("·354·")),              # 长文本 → 不屏蔽
    ]
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["p1"].excluded is True and verdicts["p1"].rule == "page_furniture"
    assert verdicts["p2"].excluded is True
    assert verdicts["p3"].excluded is False, "单页出现不构成残留"
    assert verdicts["n1"].excluded is False, "长文本不该被当成页眉页脚"


# ── 规则 4 · 纯图无题注 ─────────────────────────────────────────────────


def test_figure_without_caption_excluded(cfg):
    chunks = [
        _chunk("f1", "某图块", "（无文字）", ctype="image"),
        _chunk("f2", "图3 严重过敏反应处理流程", "流程说明", ctype="image"),
    ]
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["f1"].excluded is True and verdicts["f1"].rule == "figure_no_caption"
    assert verdicts["f2"].excluded is False


# ── 人工优先于规则 ─────────────────────────────────────────────────────


def test_manual_restore_beats_rule(cfg):
    chunks = [_chunk(f"c{i}", f"第{i}节", _pad("内容")) for i in range(9)]
    chunks.append(_chunk("c-ref", "参考文献", _pad("[1] 可检索的引用说明")))
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["c-ref"].excluded is True

    applied = noise.apply_overrides(verdicts, {"restore": ["c-ref"], "exclude": []})
    assert applied["c-ref"].excluded is False
    assert applied["c-ref"].by == "manual_restore"
    assert applied["c0"].excluded is False


def test_manual_exclude_beats_clean_chunk(cfg):
    chunks = [_chunk("c0", "正常章节", _pad("正文内容"))]
    verdicts = noise.detect(chunks, cfg)
    assert verdicts["c0"].excluded is False

    applied = noise.apply_overrides(verdicts, {"restore": [], "exclude": ["c0"]})
    assert applied["c0"].excluded is True
    assert applied["c0"].by == "manual_exclude"


def test_exclude_wins_over_restore_when_conflicting(cfg):
    """同一 kb_id 同时出现在两个列表 → 取更保守的（屏蔽）"""
    chunks = [_chunk("c0", "章节", _pad("正文"))]
    applied = noise.apply_overrides(
        noise.detect(chunks, cfg), {"restore": ["c0"], "exclude": ["c0"]}
    )
    assert applied["c0"].excluded is True
    assert applied["c0"].by == "manual_exclude"


# ── 人工决定的持久化与指纹 ───────────────────────────────────────────────


def test_overrides_round_trip(tmp_path: Path):
    edits = tmp_path / "edits"
    assert noise.load_overrides(edits) == noise.empty_overrides()

    noise.save_overrides(edits, {"restore": ["b", "a"], "exclude": ["c"]})
    loaded = noise.load_overrides(edits)
    assert loaded["restore"] == ["a", "b"]        # 去重并排序
    assert loaded["exclude"] == ["c"]


def test_overrides_corrupt_file_does_not_raise(tmp_path: Path):
    edits = tmp_path / "edits"
    edits.mkdir()
    (edits / noise.OVERRIDES_FILE).write_text("{ not json", encoding="utf-8")
    assert noise.load_overrides(edits) == noise.empty_overrides()


def test_overrides_hash_is_order_insensitive_and_change_sensitive():
    a = noise.overrides_hash({"restore": ["x", "y"], "exclude": []})
    b = noise.overrides_hash({"restore": ["y", "x"], "exclude": []})
    c = noise.overrides_hash({"restore": ["x"], "exclude": []})
    assert a == b, "同一组决定的顺序不应影响指纹"
    assert a != c, "决定变了指纹必须变（否则恢复后重跑会命中旧缓存）"
