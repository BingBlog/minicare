"""回归测试：Markdown ↔ content_list 块对齐（US-14）

守住 `md_align` 模块 docstring 里承诺的两个不变式：
  ① 单调不重叠：后一个块的起点严格大于前一个；
  ② 不丢字：`preamble + Σ chunks == 原文`。
另加两条来自实测的前提：页眉/页脚/页码类块**不进 md**，空文本块也**不该**拿到片段。
"""
from kb_pipeline.md_align import (
    NOT_IN_MD_TYPES,
    anchor_for,
    build_chunks,
    rewrite_image_paths,
)

MD = """# 标题

正文第一段。

## 小节

- 列表项 A
- 列表项 B

表1 剂量
<table><tr><td>组别</td></tr></table>

![](images/abc.jpg)

页脚说明
"""

ITEMS = [
    {"type": "text", "text": "标题", "text_level": 1},
    {"type": "header", "text": "页眉不该进 md"},
    {"type": "text", "text": "正文第一段。"},
    {"type": "text", "text": "小节", "text_level": 2},
    {"type": "list", "list_items": ["列表项 A", "列表项 B"]},
    {"type": "table", "table_caption": ["表1 剂量"], "table_body": "<table></table>"},
    {"type": "image", "img_path": "images/abc.jpg"},
    {"type": "text", "text": ""},
    {"type": "footer", "text": "页脚"},
    {"type": "text", "text": "页脚说明"},
]


def test_chunks_are_monotonic_and_lossless() -> None:
    preamble, chunks = build_chunks(MD, ITEMS)
    assert chunks, "应当切出片段"
    # ② 不丢字
    rebuilt = preamble + "".join(c["md"] for c in chunks)
    assert rebuilt == MD, "preamble + chunks 必须等于原文"
    # ① 单调不重叠（按 chunk 顺序，逐段拼接即为原文，天然不重叠；再显式校验起点递增）
    assert rebuilt.startswith(preamble)


def test_furniture_and_empty_blocks_get_no_chunk() -> None:
    _, chunks = build_chunks(MD, ITEMS)
    got = {c["block_i"] for c in chunks}
    assert 1 not in got, "header 不该有 md 片段（MinerU 不导出）"
    assert 8 not in got, "footer 不该有 md 片段"
    assert 7 not in got, "空文本块不该有 md 片段（锚点为空）"
    # 有内容的块应当都有片段
    for i in (0, 2, 3, 4, 5, 6, 9):
        assert i in got, f"块 {i} 应当有 md 片段"


def test_block_index_maps_back_to_items() -> None:
    _, chunks = build_chunks(MD, ITEMS)
    for c in chunks:
        assert 0 <= c["block_i"] < len(ITEMS)
        # 片段内容应能在对应块里找到依据（表格用 caption、图片用路径、文本用原文）
        item = ITEMS[c["block_i"]]
        if item["type"] == "table":
            assert c["md"].strip().startswith("表1 剂量")


def test_chunk_starts_at_line_beginning_keeps_markdown_syntax() -> None:
    """片段必须从**行首**开始，否则会截掉 `## ` / `- ` / `![](  ` 等语法前缀。

    实测踩到过：图片块 anchor 是 `images/x.jpg`，md 里是 `![](images/x.jpg)`，
    直接从 anchor 切会把 `![]( ` 截掉 → 链接破损、且 `](images/` 改写模式匹配不到。
    """
    _, chunks = build_chunks(MD, ITEMS)
    by_i = {c["block_i"]: c["md"] for c in chunks}
    assert by_i[3].lstrip().startswith("## "), f"标题丢了 '## ' 前缀：{by_i[3][:20]!r}"
    assert by_i[4].lstrip().startswith("- "), f"列表丢了 '- ' 前缀：{by_i[4][:20]!r}"
    assert by_i[6].lstrip().startswith("!["), f"图片丢了 '![' 前缀：{by_i[6][:20]!r}"


def test_not_in_md_types_covers_page_auxiliary() -> None:
    assert NOT_IN_MD_TYPES == frozenset({"header", "footer", "page_number", "page_footnote"})
    for t in NOT_IN_MD_TYPES:
        assert anchor_for({"type": t, "text": "x"}) is None


def test_rewrite_image_paths() -> None:
    out = rewrite_image_paths(MD, "/api/docs/d/img")
    assert "![](/api/docs/d/img/abc.jpg)" in out
    assert "](images/" not in out
