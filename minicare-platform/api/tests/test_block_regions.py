"""块的真实落点：`block_text` 与 `bbox_is_partial`（纯函数部分）

几何还原依赖 PDF 文字层（`render_pages.text_regions`），单测里没有 PDF，所以只钉住
**判据**本身 —— 判据错了，"要不要补落点"就会大面积误判。
"""
from kb_pipeline.anchors.chunk_align import block_text
from kb_pipeline.block_regions import bbox_is_partial


def test_block_text_reads_list_items():
    """⚠️ `list` 型的正文在 `list_items` 里，`text` 恒为空 —— 用 `text` 会把整条参考文献
    当成"空文本块"（界面显示"（无文本）"、还可能被误当续排区域）"""
    blk = {"type": "list", "text": "", "list_items": ["第一条", "第二条"]}
    assert block_text(blk) == "第一条\n第二条"
    # 有 text 时以 text 为准
    assert block_text({"type": "text", "text": "正文", "list_items": ["x"]}) == "正文"
    assert block_text({"type": "list", "text": "  ", "list_items": []}) == ""


def test_bbox_is_partial_only_when_bbox_text_is_a_prefix_part():
    """判据：bbox 里印的字必须是块文字的一部分，且**明显更少**才算 bbox 不完整"""
    item0 = "中华儿科杂志编辑委员会，中华医学会儿科学分会.儿童过敏性疾病诊断及治疗专家共识[J].中华儿科杂志，2019（3）：164-171."
    rest = "张亚钦，武华红，宗心南，等.中国九城市七岁以下儿童生长迟缓影响因素的调查[J].中华儿科杂志，2021（9）：743-751."
    whole = item0 + rest

    # 实测情形：bbox 只覆盖第一条（引文标记在归一化时已被剥掉，两边都能对上）
    assert bbox_is_partial(whole, item0)
    # bbox 里印的就是全文 → 不用补
    assert not bbox_is_partial(whole, whole)
    # bbox 里印的字根本不在这个块里（大概率是另一个块的框）→ 不乱补
    assert not bbox_is_partial(whole, "另一段完全无关的文字，长度也够长可以参与判定了")
    # 太短不给判（免得靠几个字就下结论）
    assert not bbox_is_partial(whole, "中华儿科")


def test_bbox_is_partial_tolerates_small_differences():
    """留给空格/标点差异 15% 余量：只差一个句号不算 bbox 不完整"""
    whole = "过敏性疾病是婴幼儿期常见的健康问题，对儿童体格生长和心理健康均可产生不良影响，也给家庭和社会带来医疗负担。"
    same = "过敏性疾病是婴幼儿期常见的健康问题，对儿童体格生长和心理健康均可产生不良影响，也给家庭和社会带来医疗负担"  # 少个句号
    assert not bbox_is_partial(whole, same)
