"""块的**真实落点**：MinerU 给的 `bbox` 有时只覆盖块的一部分，这里按需用 PDF 文字层还原。

## 为什么需要（对照 MinerU 源码）

`content_list.json` 是 MinerU 内部块模型的**渲染视图**，不是它的原貌：

* `mineru/render/_internal/content_list/common.py: unit_bbox()` —— 参考文献是**每条一个
  `RefTextBlock`**（各自有 bbox），渲染时才被 `ReferenceGroup` 合成一个 `list` 项，bbox 取
  **各条的最小包围盒**。最小包围盒一跨栏就退化成"只剩一栏"：实测
  `2025_婴幼儿过敏性疾病预防健康教育专家共识` 的块 #120（`list`/`ref_text`，9 条）bbox 是
  `[104,848,483,893]`（第 1 页左栏底部两条），而整条列表印在**左栏底部 + 右栏整栏**；
  #123 的 27 条同理。`bbox` 里印的字与 `list_items[0]` **逐字相同**（实测），可作判据。
* 同类缺陷也见于跨栏/跨页的普通段落（`bbox` 只覆盖第一栏）。

MinerU 自己的可视化是**按内部块**画框的（每条参考文献一个框），粒度比 content_list 细。
我们本地**没有** `middle.json`（`parse` 只留了 md + content_list + images），
所以这里改用 PDF 自带文字层把落点还原出来 —— 字在哪儿就框在哪儿，不靠阈值猜。

## 粒度约定

* `list` 块：**一条一个（组）矩形**（用户要的"每条一个高亮区块"）；
* 其它块：只有当 `bbox` 明显装不下它的文字时，才补"其余落点"（按栏切段，通常 1~2 个矩形）。

⚠️ 判据是**文字层**（bbox 里印的字是不是块文字的一部分），不是密度阈值 —— 密度估算实测不可靠
（同一页不同字号的块差好几倍），会把大量正常块误判成"装不下"。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .anchors.chunk_align import block_text
from .render_pages import text_in_bboxes, text_regions

# 只有这些类型的块才去算"其余落点"：
# · `list` —— MinerU 的 bbox 只覆盖第一条，是**已知的系统性缺陷**（134 个里 80 个文字量远超 bbox）；
# · `text` —— 跨栏/跨页段落会被记成"只覆盖第一栏"（数量少但确实存在）。
# 表格/图片/公式有自己的块与渲染，不该被"续排"进来。
_REGION_TYPES = frozenset({"list", "text"})


def bbox_is_partial(block_text_: str, bbox_text: str) -> bool:
    """`bbox` 里印的字明显少于块文字 → bbox 不完整（且 bbox 那部分确实来自这个块）

    纯函数、不碰 PDF，便于单测；判据见模块 docstring —— **用文字层核，不用密度阈值**。
    """
    got = _plain_norm(bbox_text)
    whole = _plain_norm(block_text_)
    if len(got) < 8 or len(whole) < 8:
        return False
    # bbox 里印的字必须是块文字的一部分（否则这个 bbox 根本不是这个块的地方，别乱补）
    if got not in whole:
        return False
    # 明显更少才算不完整：留 15% 余量给空格/标点差异
    return len(got) < 0.85 * len(whole)


def _plain_norm(s: str) -> str:
    from .anchors.chunk_align import _plain  # 同一套归一化（剥引文标记 + 去空白）

    return _plain(s)


def block_regions(
    pdf_path: str | Path | None,
    block: dict[str, Any],
    *,
    bbox_text: str = "",
    space: int = 1000,
) -> list[dict[str, Any]]:
    """该块**除 bbox 之外**还需要画的矩形（每条/每栏一个）。

    * `list` 块 → 逐条还原（MinerU 的 bbox 只覆盖第一条）；
    * 其它块 → 仅当 bbox 装不下它的文字时，补出其余落点；
    * 没有源 PDF / 定位不到 / bbox 本来就准 → 返回 `[]`（调用方按原 bbox 画，不猜）。
    """
    if not pdf_path or block.get("type") not in _REGION_TYPES:
        return []
    if not isinstance(block.get("bbox"), list) or len(block["bbox"]) != 4:
        return []
    page_idx = block.get("page_idx")
    if page_idx is None:
        return []

    whole = block_text(block).strip()
    if len(_plain_norm(whole)) < 8:
        return []

    if block.get("type") == "list":
        return _list_item_regions(pdf_path, int(page_idx), block, space=space)

    if not bbox_is_partial(whole, bbox_text):
        return []
    return [
        {"page_idx": int(page_idx), "bbox": [round(v) for v in r]}
        for r in text_regions(pdf_path, int(page_idx), whole, skip_chars=len(_plain_norm(bbox_text)), space=space)
    ]


def _list_item_regions(
    pdf_path: str | Path, page_idx: int, block: dict[str, Any], *, space: int
) -> list[dict[str, Any]]:
    """`list` 块按**条目**还原：一条一个矩形（跨栏的长条目可能两个）"""
    items = [str(x) for x in (block.get("list_items") or []) if str(x).strip()]
    if len(items) < 2:
        return []
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(items):
        for r in text_regions(pdf_path, page_idx, item, space=space, max_rects=2):
            out.append({
                "page_idx": page_idx,
                "bbox": [round(v) for v in r],
                "item": idx,
            })
    return out


def bbox_texts_for_blocks(
    pdf_path: str | Path | None, blocks: list[dict[str, Any]], *, space: int = 1000
) -> list[str]:
    """批量取"每个块的 bbox 位置上实际印的字"（顺序与 `blocks` 一致）"""
    if not pdf_path:
        return ["" for _ in blocks]
    jobs = [
        (int(b.get("page_idx") or 0), tuple(b["bbox"]))
        for b in blocks
        if b.get("type") in _REGION_TYPES and isinstance(b.get("bbox"), list) and len(b["bbox"]) == 4
    ]
    got = text_in_bboxes(pdf_path, jobs, space=space)
    it = iter(got)
    return [
        next(it)
        if b.get("type") in _REGION_TYPES and isinstance(b.get("bbox"), list) and len(b["bbox"]) == 4
        else ""
        for b in blocks
    ]
