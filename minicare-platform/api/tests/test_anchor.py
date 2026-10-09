"""页码锚定测试"""
from kb_pipeline.anchors.chunk_align import find_continuations, merge_continuations
from kb_pipeline.anchors.page_anchor import anchor_chunk, build_page_index


def test_build_index(sample_doc):
    idx = build_page_index(sample_doc.content_list_path)
    assert len(idx) == 4
    assert idx[0][1] == 0


def test_anchor_match(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    plain_chunk.content = "严重过敏反应是一种速发、危及生命、可累及全身多系统"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx == 0


def test_anchor_no_match(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    plain_chunk.content = "完全不相关的开头文本内容测试"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx is None


def test_anchor_fuzzy_tolerance(sample_doc, plain_chunk):
    idx = build_page_index(sample_doc.content_list_path)
    # 1 字差异（OCR 容差）
    plain_chunk.content = "严重过敏反应是一种速发、危及生命,可累及全身多系统"
    anchor_chunk(plain_chunk, idx)
    assert plain_chunk.page_idx == 0


# ── 续排区域（跨栏 / 跨页段落）─────────────────────────────────────────
#
# 背景：MinerU 对**跨栏 / 跨页段落**只给**一个落点**的 bbox，其余落点被记成**空文本块**
# （实测：2025_婴幼儿过敏性疾病预防健康教育专家共识，块 #11 有整段 408 字但 bbox 只有第 1 页
# 左栏；#12 是第 1 页右栏、#17 是第 2 页左上，两条 text 都为空）。空块没有 md 片段 →
# 文本对齐永远挂不上它，只能另找落点，否则选中该切片时那几处原文不会高亮。


def _blk(i, *, page=0, bbox, text="", type_="text"):
    return {"i": i, "page_idx": page, "bbox": bbox, "text": text, "type": type_}


def test_continuation_same_page_next_column():
    """同页换栏：空块在**右侧** → 是本段的落点"""
    items = [
        _blk(0, bbox=[101, 808, 486, 860], text="一整段跨栏的文字"),
        _blk(1, bbox=[509, 783, 897, 861], text=""),          # 右栏，空
    ]
    assert find_continuations([0], items) == [1]


def test_left_side_empty_block_is_not_a_continuation():
    """⚠️ 左侧的空区域**不是**续排：双栏阅读顺序是"左栏读到底再读右栏"，
    位于文字块左边的区域在阅读顺序上排在它前面。实测靠这条剔掉过误报。"""
    items = [
        _blk(0, bbox=[509, 107, 897, 769], text="整栏右栏的文字"),
        _blk(1, bbox=[99, 107, 486, 301], text=""),           # 左栏，空
    ]
    assert find_continuations([0], items) == []


def test_continuation_right_column_top_follows_left_column_bottom():
    """⚠️ 换栏发生在"左栏**末尾** → 右栏**开头**"，二者高度往往**不重叠**
    （实测块 #41 止于 y=912、块 #42 起于 y=280）—— 所以不能用"纵向重叠"当条件。"""
    items = [
        _blk(0, bbox=[99, 824, 486, 912], text="左栏排到页底的那一段"),
        _blk(1, bbox=[509, 280, 895, 350], text=""),          # 右栏顶部，空
    ]
    assert find_continuations([0], items) == [1]


def test_continuation_across_pages():
    """跨页：上一块触到页底、这一块从页顶开始 → 是本段的落点（2026-10-04 补，
    原先只认同页，导致「制定背景」那段在第 2 页左上角的第三部分永远高亮不出来）"""
    items = [
        _blk(0, page=0, bbox=[509, 806, 897, 912], text="本段排到第一页最后一行"),
        _blk(1, page=1, bbox=[99, 107, 486, 301], text=""),   # 下一页左上，空
    ]
    assert find_continuations([0], items) == [1]


def test_cross_page_block_not_at_page_top_is_not_a_continuation():
    """下一页但不是从页顶开始 → 不是上一页那段的落点"""
    items = [
        _blk(0, page=0, bbox=[101, 808, 486, 860], text="文字"),
        _blk(1, page=1, bbox=[509, 400, 897, 600], text=""),
    ]
    assert find_continuations([0], items) == []


def test_continuation_chain_stops_at_real_text():
    """中间夹着**有字的正文块** → 链到此为止（后面是别人的文字）。
    旧版没有这条，才会把右栏顶部的空块错挂给左栏同一高度的切片。"""
    items = [
        _blk(0, bbox=[101, 107, 486, 230], text="本切片的正文"),
        _blk(1, bbox=[101, 233, 486, 300], text="别人的正文"),  # 有字 → 停
        _blk(2, bbox=[509, 107, 897, 212], text=""),
    ]
    assert find_continuations([0], items) == []


def test_continuation_skips_furniture_between():
    """页眉 / 页码夹在中间不打断阅读顺序 → 下一处落点照样收"""
    items = [
        _blk(0, bbox=[101, 808, 486, 860], text="本段"),
        _blk(1, bbox=[485, 916, 514, 927], text="354", type_="page_number"),
        _blk(2, page=1, bbox=[99, 107, 486, 301], text=""),
    ]
    assert find_continuations([0], items) == [2]


def test_continuation_chain_two_hops():
    """一段跨三处：左栏 → 右栏 → 下一页左上（#11 / #12 / #17 那一例）"""
    items = [
        _blk(0, page=0, bbox=[101, 782, 200, 797], text="1 制定背景"),
        _blk(1, page=0, bbox=[101, 808, 486, 860], text="整段 408 字"),
        _blk(2, page=0, bbox=[509, 783, 897, 861], text=""),
        _blk(3, page=0, bbox=[485, 914, 514, 927], text="354", type_="page_number"),
        _blk(4, page=1, bbox=[99, 107, 486, 301], text=""),
        _blk(5, page=1, bbox=[102, 312, 236, 327], text="2 流行病学特征"),
    ]
    assert find_continuations([0, 1], items) == [2, 4]


def test_continuation_verified_by_pdf_text_layer():
    """有文字层时：那个位置**实际印的字**确实来自本切片才收（引文标记先剥掉）"""
    items = [
        _blk(0, bbox=[101, 808, 486, 860], text="本段的整段文字"),
        _blk(1, bbox=[509, 783, 897, 861], text=""),
    ]
    chunk = "本段的整段文字，这里就是后半截，对得上。"
    hit = {1: "这里就是后半截[1-2]，对得上"}
    miss = {1: "这是别人那一段的字"}
    assert find_continuations([0], items, chunk_text=chunk, region_text=hit) == [1]
    assert find_continuations([0], items, chunk_text=chunk, region_text=miss) == []


def test_text_covered_accumulates_split_runs():
    """⚠️ 不能只看"最长公共块"：标记残留（`2\\~3d` vs `2~3d`）会把匹配**从中间断开**，
    只看最长那段会把"其实整段都对得上"判成"对不上"（实测块 #64 最长块只到 90%、累计 100%）。"""
    from kb_pipeline.anchors.chunk_align import _text_covered

    region = "建议每次只引入1种新的食物，引入后至少适应2~3d再添加其他新食物"
    chunk = "建议每次只引入1种新的食物，引入后至少适应2\\~3d再添加其他新食物，密切观察"
    assert _text_covered(region, chunk)
    # 整块都是别人写的 → 不该被算成覆盖
    assert not _text_covered("这一整段话都来自另一篇文献，与本切片毫无关系", chunk)


def test_continuation_geometry_only_without_text_layer():
    """取不到文字层（扫描件 / 没装渲染依赖）→ **不校验**，退回几何判断，别把"读不到"当"对不上\""""
    items = [
        _blk(0, bbox=[101, 808, 486, 860], text="本段"),
        _blk(1, bbox=[509, 783, 897, 861], text=""),
    ]
    assert find_continuations([0], items, chunk_text="完全无关的内容", region_text={}) == [1]


def test_continuation_skips_nonempty_and_nontext_blocks():
    """有文字的块不走这条（它该被文本对齐覆盖）；非 text 类型也不补"""
    items = [
        _blk(0, bbox=[101, 808, 486, 860], text="文字"),
        _blk(1, bbox=[509, 783, 897, 861], text="也有文字的块"),
        _blk(2, bbox=[509, 783, 897, 861], text="", type_="image"),
    ]
    assert find_continuations([0], items) == []


def test_merge_continuations_keeps_order_and_dedupes():
    assert merge_continuations([10, 11], [12, 17]) == [10, 11, 12, 17]
    assert merge_continuations([11, 12], [12]) == [11, 12]
