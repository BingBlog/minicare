"""切片 ↔ 原文块对齐：把切块产物**精确**锚回 content_list 的块。

## 为什么不用文本匹配
切片的内容经过「去 `<sup>` 引文、去空行、按 `header_path` 重排」等处理，**已经不是原文的子串**。
纯文本匹配（把两侧都去掉标签与空白后互找）实测只能命中 **88.5%**（96 片里 85 片）。
用 difflib 对齐两份 md 能修坐标系，但 23KB 就要 1.25s，放 HTTP 端点里不可接受。

## 实际做法：让切块记源行号，再沿行映射换算字符区间
```
原始 md 行 i
  └─ clean_text_with_map ─▶ 归一化 md 行 j（line_map[j] = i）
     └─ infer_plain_headings / fix_heading_levels ─▶ 行号不变（都是逐行保序）
        └─ chunk_document 在 Chunk 上记 line_start/line_end（归一化 md 的**行号**）
           └─ line_map 换算 ─▶ 原始 md 行区间 ─▶ 行偏移前缀和 ─▶ 原始 md 字符区间
              └─ 与 md_align 的 md_chunk 区间求交 ─▶ block_i
```
实测命中 **100%**（同两份文档 96/96）。

## 每一环的前提（改动时必须守）
1. `preprocess.clean.clean_text_with_map` —— 唯一会**丢行**的地方，必须同步产出 `line_map`；
2. `preprocess.headings` 的两个函数 —— 必须**一行进一行出**（现在满足）；
3. `chunking.pipeline._extract_tables` —— 表格若**跨行**，占位替换会改变行数；
   切块侧有行数校验，不成立时会把 `line_start/line_end` 置 None，本模块随即退化为
   **按页码定位**（不猜、不给出看起来对的错答案）；
4. `md_align.build_chunks` 的无损不变式 `preamble + Σ md_chunks == 原文`（有测试守着）——
   本模块靠它用累计长度算 md_chunk 的字符区间。
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def line_offsets(text: str) -> tuple[list[int], list[str]]:
    """每行的起始字符偏移 + 行数组。偏移按 `\\n` 计（`splitlines` 不保留换行符）"""
    lines = text.splitlines()
    offs: list[int] = []
    p = 0
    for ln in lines:
        offs.append(p)
        p += len(ln) + 1
    return offs, lines


def raw_char_range(
    line_start: int | None,
    line_end: int | None,
    line_map: list[int],
    offs: list[int],
    lines: list[str],
) -> tuple[int, int] | None:
    """归一化 md 的行区间 → 原始 md 的字符区间（半开）。任一步不成立返回 None。"""
    if line_start is None or line_end is None or not line_map:
        return None
    if line_start >= len(line_map) or line_end <= line_start:
        return None
    a = line_map[line_start]
    b = line_map[min(line_end - 1, len(line_map) - 1)]
    if a >= len(offs) or b >= len(offs):
        return None
    return offs[a], offs[b] + len(lines[b])


def md_block_ranges(md_text: str, raw_items: list[dict[str, Any]]) -> list[tuple[int, int, int]]:
    """`md_align` 的 md 片段 → (起, 止, block_i) 列表（字符区间，按顺序）

    区间起点靠**累计长度**推：`build_chunks` 保证 `preamble + Σ chunks == 原文`（有测试钉住），
    所以不需要 md_align 自己吐偏移。
    """
    from ..md_align import build_chunks

    if not md_text or not raw_items:
        return []
    preamble, chunks = build_chunks(md_text, raw_items)
    out: list[tuple[int, int, int]] = []
    pos = len(preamble)
    for c in chunks:
        seg = c["md"]
        out.append((pos, pos + len(seg), int(c["block_i"])))
        pos += len(seg)
    return out


def load_content_list(path: str | None) -> list[dict[str, Any]]:
    if not path:
        return []
    p = Path(path)
    if not p.exists():
        return []
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []


def _bbox_ok(b: Any) -> bool:
    return isinstance(b, dict) and isinstance(b.get("bbox"), list) and len(b["bbox"]) == 4


def block_text(b: dict[str, Any]) -> str:
    """块的**可读文字**：`list` 型的内容在 `list_items` 里，`text` 恒为空。

    ⚠️ 判断"这个块是不是空的"必须用它 —— 否则整条参考文献（几十条、上千字）会被当成
    **空文本块**：既可能被误当"续排区域"，界面也会显示成"（无文本）"。
    """
    t = b.get("text") or ""
    if t.strip():
        return t
    return "\n".join(str(x) for x in (b.get("list_items") or []))


# ── 续排区域（同一段文字在版面上的其余落点）────────────────────────────
#
# 判定阈值（单位与 bbox 相同：每轴归一化到 0~1000）
_CONT_X_GAP = 80           # 同页换栏时两栏之间的栏沟宽度上限（实测 20~40）
_CONT_PAGE_BOTTOM = 700    # 跨页续排：上一块要"触到页底"
_CONT_PAGE_TOP = 350       # 跨页续排：这一块要"从页顶开始"
_CONT_VERIFY_RATIO = 0.85  # 与切片正文的文字重合度下限（有 PDF 文字层时启用）
_VERIFY_MIN_RUN = 6        # 校验时"算数"的最短连续命中片段；见 `_text_covered`

# 不参与正文流的块：页眉/页脚/页码/脚注，以及**页边文字**（`aside_text` —— 实测是
# "Author Manuscript" 这类页边水印，它夹在正文块中间，实测正因为它挡住了"上一页末尾 → 下一页页首"
# 的续排判断，`AAP_2025.10_早期引入与过敏模式` 的 3 处跨页落点全部漏检）。
# 它们都不打断"上一块 → 下一块"的续排关系。
_FURNITURE = frozenset({"header", "footer", "page_number", "page_footnote", "aside_text"})

# 引文标记：切块阶段会把 `<sup>[1-2]</sup>` 去掉，而 PDF 文字层里还在 —— 校验时必须先剥掉，
# 否则会把"明明对得上"判成"对不上"（踩过：块 #42 与切片 -10 因此被判为不匹配）
_CITE_RE = re.compile(r"\[[\d,，\-–~\s]*\]")
# 残留的 HTML 式标记（实测 `<sub>p</sub><0.05)` 这种只清 `<sup>` 没清干净，PDF 里印的是 `(p<0.05)`
# —— 不剥掉同样会把"对得上"判成"对不上"）
_TAG_RE = re.compile(r"<[^<>]{0,24}>")


def _plain(s: str) -> str:
    """比对用归一化：去标记（引文 + 残留 HTML 标签）、去所有空白"""
    return re.sub(r"\s+", "", _CITE_RE.sub("", _TAG_RE.sub("", s or "")))


def _text_covered(needle: str, hay: str) -> bool:
    """PDF 文字层取到的那段文字，是否确实来自切片的正文

    ⚠️ **别只看"最长公共块"**（踩过）：标记残留或段落边界会让某次匹配**从中间断开**，
    于是"其实整段都对得上"被判成"对不上" ——
    实测 `AAP_2025.10_早期引入与过敏模式` 块 #35 的区域只有 **38%** 落在最长公共块里，
    但把**各段匹配累计**起来有 **91%**；块 #64（切片 -19）更极端：最长块只到 90%，
    累计却是 **100%** —— 它只是被 `2~3d` 与 chunk 里 `2\\~3d` 那个反斜杠断成了两截。

    所以按**累计匹配长度**判：把 `SequenceMatcher` 的各段匹配（短于 `_VERIFY_MIN_RUN` 的不算，
    免得靠几个虚词凑数）加起来，够长就算覆盖。区域是个粗矩形，边缘蹭到邻行是正常的，
    留 15% 的余量刚好。
    """
    n, h = _plain(needle), _plain(hay)
    if not n or not h:
        return False
    if n in h:
        return True
    from difflib import SequenceMatcher

    sm = SequenceMatcher(None, n, h, autojunk=False)
    covered = sum(b.size for b in sm.get_matching_blocks() if b.size >= _VERIFY_MIN_RUN)
    return covered >= _CONT_VERIFY_RATIO * len(n)


def _flows_after(prev_i: int, i: int, raw_items: list[dict[str, Any]]) -> bool:
    """空块 `i` 是不是紧接在上一块 `prev_i` 之后（同一段文字的下一个落点）"""
    p, e = raw_items[prev_i], raw_items[i]
    pp, pe = p.get("page_idx"), e.get("page_idx")
    if pp is None or pe is None:
        return False
    px1, _, px2, _ = p["bbox"]
    ex1, ey1, _, _ = e["bbox"]
    if pp == pe:
        # 同页换栏：双栏排版的阅读顺序是"左栏读到底再换右栏"，所以落点只可能在**右侧**。
        # 位于左侧的空区域在阅读顺序上排在它前面，不可能是续排 —— 实测正是靠这一条剔掉过误报。
        # ⚠️ 不能要求"纵向重叠"：换栏发生在左栏的**末尾**与右栏的**开头**，
        #    二者高度往往并不重叠（实测块 #41 止于 y=912、块 #42 起于 y=280）。
        return ex1 > px1 and 0 <= ex1 - px2 <= _CONT_X_GAP
    if pe == pp + 1:
        # 跨页续排：上一块触到页底、这一块从页顶开始。换页就是接着排，左右栏都可能，
        # 所以这里不限定横向位置。这一条是 2026-10-04 补的 —— 原先只认同页，
        # 结果「制定背景」那段的第三部分（第 2 页左上角）永远高亮不出来。
        return p["bbox"][3] >= _CONT_PAGE_BOTTOM and ey1 <= _CONT_PAGE_TOP
    return False


def find_continuations(
    selected: list[int],
    raw_items: list[dict[str, Any]],
    *,
    chunk_text: str | None = None,
    region_text: dict[int, str] | None = None,
) -> list[int]:
    """找出「**空文本的续排区域**」的块下标 —— 这一段的字，在版面上的另外几个落点。

    ## 为什么需要它（实测踩到的坑）
    MinerU 对**跨栏/跨页段落**的产出是：把**整段文字**放进一个块，而**其余视觉区域**记成
    **文本为空的 text 块**。实测样例（2025_婴幼儿过敏性疾病预防健康教育专家共识 第 1~2 页）：
      块 #11 text=408 字（整段），bbox 只有**左栏** 101~486；
      块 #12 text=**空**，bbox 是**右栏** 509~897；
      块 #17 text=**空**，bbox 是**第 2 页左上** 99~486。
    于是切到该切片时只有左栏高亮，另外两处明明属于它却"没选中"，看起来就是"对不上、
    少了后面半截"。空文本块**没有 md 片段**，文本对齐（`align_chunks_to_blocks`）永远挂不上它。

    ## 怎么找：沿阅读顺序往下走，遇到正文块就停
    从每个已选中的块出发，沿 content_list 的**阅读顺序**往后走：
      · 页眉/页脚/页码/脚注 —— 跳过（它们夹在正文块中间，不打断续排关系）；
      · 本切片自己的块   —— 接着从它往后看；
      · 有字的正文块     —— **停**（这一段的落点到此为止，后面是别人的文字）；
      · 空文本块         —— 只有**接着排**（`_flows_after`）才收下，然后继续往后走。

    ⚠️ 「沿阅读顺序走」这条是 2026-10-04 加的，它顺手修掉了一类**误报**：
    旧版只看"同页 + 纵向重叠 + 在右侧"，于是把**右栏顶部**的空块判给了**左栏同一高度**的块。
    实测块 #64（第 4 页右栏顶部）被错挂到切片 -15（第 4 页左栏上部），而它其实是切片 -19 的续排
    —— 因为双栏里"右栏顶部"接的是"左栏末尾"，跟纵向高度无关。

    ## 有 PDF 文字层时再做一道校验
    `region_text` 给的是「该空块位置上**原文**印着什么字」（由 `render_pages.text_in_bboxes`
    按 bbox 从 PDF 文字层取回）。只有这些字确实来自切片正文（`chunk_text`）才收下 ——
    这样"按位置补"就从**几何猜测**变成了**可验证的事实**，可以放心当正常高亮展示。
    取不到文字（扫描件无文字层、没装渲染依赖）时不校验，退回纯几何判断。
    """
    sel = set(selected)
    out: set[int] = set()
    n = len(raw_items)
    for j in sorted(sel):
        if not (0 <= j < n) or not _bbox_ok(raw_items[j]):
            continue
        prev = j
        for i in range(j + 1, n):
            b = raw_items[i]
            if not _bbox_ok(b):
                break
            t = b.get("type")
            if t in _FURNITURE:
                continue
            if i in sel:
                prev = i
                continue
            if t != "text" or block_text(b).strip():
                break
            if not _flows_after(prev, i, raw_items):
                break
            txt = (region_text or {}).get(i) or ""
            if txt and chunk_text and not _text_covered(txt, chunk_text):
                break          # 原文那个位置上印的不是本切片的字 → 不是它的落点
            out.add(i)
            prev = i
    return sorted(out)


def merge_continuations(block_is: list[int], continuation_is: list[int]) -> list[int]:
    """把续排区域并进切片的块列表（去重、保持下标升序）

    合并之后它们就是"这个切片覆盖的块"，与文本对齐上的块**同等**高亮 ——
    界面不再区分"实线/虚线"（见 `web/routers.doc_segments` 的说明）。
    """
    return sorted(set(block_is) | set(continuation_is))


def align_chunks_to_blocks(
    chunks: list[dict[str, Any]],
    *,
    md_text: str,
    raw_items: list[dict[str, Any]],
    line_map: list[int],
) -> dict[str, list[int]]:
    """{kb_id: [block_i, ...]}。无行号或区间为空时该切片不在结果里（调用方按页码兜底）"""
    offs, lines = line_offsets(md_text)
    ranges = md_block_ranges(md_text, raw_items)
    if not ranges:
        return {}
    out: dict[str, list[int]] = {}
    for c in chunks:
        span = raw_char_range(c.get("line_start"), c.get("line_end"), line_map, offs, lines)
        if span is None:
            continue
        a, b = span
        hits = [bi for (x, y, bi) in ranges if not (y <= a or x >= b)]
        if hits:
            out[str(c.get("kb_id"))] = hits
    return out
