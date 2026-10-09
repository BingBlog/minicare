"""Markdown ↔ content_list 块的对齐（US-14 的「原文选中 → Markdown 高亮」底座）

## 为什么需要它

MinerU 的 `<doc>.md` 与 `*_content_list.json` 是**同一批块的两个视图**：md 里的段落顺序
与 content_list 完全一致。因此可以沿 md 顺序查找每个块的首个锚点串，用相邻锚点切出该块
对应的 md 片段 —— 前端按片段渲染，就能"点左侧原文 → 右侧对应段落高亮"。

## 实测得到的三条前提（决定了锚点策略）

1. **`header` / `footer` / `page_number` / `page_footnote` 不写入 md**（MinerU 不导出）。
   实测抽查命中 md 的数量为 0~1（那 1 例是短文本恰好作为子串出现）。→ 这类块**没有 md 片段**，
   前端应明示"该块不在 Markdown 中"，而不是硬塞一个空片段。
2. **非空 `text` 块逐字出现在 md 里**（对本库 182 个块统计：非空块全部命中，未命中的 17 个都是空串）。
3. **表格**在 md 里是「标题行 + 原始 `<table>` HTML」；**图片**是 `![](images/<hash>.jpg)`。
   → 表格锚点用 `table_caption`，图片锚点用 `img_path`。

## 切片的两个不变式（有测试守住）

* **单调不重叠**：后一个块的起点严格大于前一个。
* **不丢字**：`preamble + Σ chunks == 原文`（md 里属于任何块之前的内容进 preamble）。
"""
from __future__ import annotations

import bisect
from typing import Any

# MinerU 不导出到 markdown 的类型（见模块 docstring 前提 1）
NOT_IN_MD_TYPES = frozenset({"header", "footer", "page_number", "page_footnote"})

MIN_ANCHOR_CHARS = 2


def anchor_for(item: dict[str, Any]) -> str | None:
    """取出该块在 md 中可用于定位的锚点串；返回 None 表示该块不进 md。"""
    t = item.get("type")
    if t in NOT_IN_MD_TYPES:
        return None

    if t == "text":
        return item.get("text") or None

    if t == "list":
        items = item.get("list_items") or []
        return items[0] if items else None

    if t == "table":
        caps = item.get("table_caption") or []
        if caps and caps[0].strip():
            return caps[0]
        body = item.get("table_body") or ""
        # 退化：从 HTML 里抠出第一段可见文字
        import re

        m = re.search(r">([^<>]{4,})<", body)
        return m.group(1).strip() if m else None

    if t == "image":
        return item.get("img_path") or None

    text = item.get("text")
    return text if isinstance(text, str) and text.strip() else None


def build_chunks(md_text: str, items: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """把 md 切成与块对齐的片段。

    返回 `(preamble, chunks)`；`chunks[i] = {"block_i": int, "md": str}`。
    `block_i` 是**原始 content_list 数组下标**，与 `/parsed` 返回的 `blocks[].i` 一一对应，
    因此前端可以用它把「页面上的框」与「md 片段」直接关联。
    """
    starts: list[tuple[int, int]] = []
    chunk_starts: list[int] = []
    cursor = 0
    last_start = -1
    for idx, item in enumerate(items):
        a = anchor_for(item)
        if not a or len(a.strip()) < MIN_ANCHOR_CHARS:
            continue
        pos = md_text.find(a, cursor)
        if pos < 0:
            # 容忍轻微顺序差异：全文再找一次，但绝不允许回退（保持单调）
            pos = md_text.find(a)
        if pos < 0 or (starts and pos <= starts[-1][1]):
            continue

        # ⚠️ **回退到行首**再切片。anchor 只是块内容的一部分，行首往往还有 markdown 语法前缀：
        #    标题是 `## 文本`、列表是 `- 项`、图片是 `![](images/x.jpg)`。
        #    若直接从 anchor 处切，会把前缀截掉 —— 表现为图片链接破损、标题层级丢失，
        #    并且 `](images/` 这个待改写的模式被切掉后图片路径也改写不了（实测踩到过）。
        line_start = md_text.rfind("\n", 0, pos) + 1
        start = max(line_start, last_start + 1)      # 仍要严格递增，保证不重叠
        starts.append((idx, pos))
        chunk_starts.append(start)
        last_start = start
        cursor = pos + len(a)

    if not starts:
        return (md_text, [])

    preamble = md_text[: chunk_starts[0]]
    chunks: list[dict[str, Any]] = []
    for k in range(len(starts)):
        end = chunk_starts[k + 1] if k + 1 < len(starts) else len(md_text)
        chunks.append({"block_i": starts[k][0], "md": md_text[chunk_starts[k] : end]})
    return (preamble, chunks)


def lines_to_blocks(md_text: str, items: list[dict[str, Any]]) -> list[int | None]:
    """逐行（0 基行号）→ 该行所属块的 content_list 下标；preamble（首个块之前）的行返回 None。

    「清洗对比」用它把**被清洗的行**指回原文位置（PDF 高亮框）。定位原理与 `/parsed` 的
    md 片段同源：`build_chunks` 用块锚点把 md 切成一串**连续**片段（preamble + Σ chunks == 原文），
    行首落在哪个片段的偏移区间里，就归给哪个块。

    ⚠️ 粒度是**块级**（"该看哪一段"），不是逐字对齐 —— 锚点没找到的块（MinerU 不导出到 md 的
    header/footer 等）其内容会被并进前一个块的片段；逐字定位走 `anchors/chunk_align` 的行号链。
    """
    line_count = len(md_text.splitlines())
    if not items:
        return [None] * line_count

    preamble, chunks = build_chunks(md_text, items)
    if not chunks:
        return [None] * line_count

    # 各片段起点的字符偏移（片段连续且首尾相接：preamble + 前序片段长度）
    starts: list[int] = []
    off = len(preamble)
    for c in chunks:
        starts.append(off)
        off += len(c["md"])

    # 各行的**行首**偏移
    offsets: list[int] = []
    pos = 0
    for ln in md_text.splitlines(keepends=True):
        offsets.append(pos)
        pos += len(ln)

    out: list[int | None] = []
    for lo in offsets:
        k = bisect.bisect_right(starts, lo) - 1
        out.append(chunks[k]["block_i"] if k >= 0 else None)
    return out


def rewrite_image_paths(md: str, img_url_base: str) -> str:
    """把 md 里的相对图片路径改成后端可服务的绝对路径。

    md 里是 `![](images/<hash>.jpg)`（相对于文档产物目录），在浏览器里相对当前页面解析会 404，
    因此统一替换为 `<img_url_base>/<hash>.jpg`。
    """
    return md.replace("](images/", f"]({img_url_base}/")
