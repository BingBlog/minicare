"""页面栅格化（US-14「原文对照」的 bbox 高亮底座）

## 坐标系结论（实测 11174 个块，务必先读）

MinerU 的 `*_content_list.json` 里 `bbox` 是 **[x1, y1, x2, y2]，且已按每页归一化到 0~1000**：
x 按页宽归一化、y 按页高归一化（两轴独立，**不保持页面纵横比**）。

证据：① 全库 11174 个块里最大坐标恰为 1000、最小 0、**无一块越界**；
② `header` 块 y1 中位数 44（贴顶）、`page_number` 块也在顶部行 —— 与"页眉/页码在页顶"自洽；
③ 若按 PDF pt 做等比缩放，各文档的比例常数会一致，实测却是 1.47~1.88 不等（内容极值≠页面尺寸）。

因此前端只需 `left%=x1/10, top%=y1/10, w%=(x2-x1)/10, h%=(y2-y1)/10` 做**百分比定位**，
与渲染分辨率完全无关。本模块只负责把页面渲成图。

## 为什么用 pypdfium2

它是 MinerU 自己在用的 PDF 渲染库（同一套 pdfium），渲染口径一致；且是独立第三方库，
不涉及 MinerU 自有许可（`LicenseRef-MinerU-Open-Source-License`）的代码复制问题。
"""
from __future__ import annotations

import importlib.util
import re
import threading
from pathlib import Path

from .anchors.chunk_align import _CITE_RE, _plain  # 同一套文字归一化（剥引文标记 + 去空白）

DEFAULT_SCALE = 2.0
MIN_SCALE = 0.5
MAX_SCALE = 4.0

# ⚠️ pdfium（pypdfium2 的底层 C 库）**不是线程安全的**：并发渲染同一/不同文档都可能崩。
# FastAPI 的同步端点跑在线程池里，因此必须串行化渲染调用。
# MinerU 自己也这么做（`docvortex/document/pdf/pdfium.py` 的 `_pdfium_lock = threading.RLock()`
# + `pdfium_guard()`）。用 RLock 而非 Lock：渲染路径里可能存在重入调用。
_pdfium_lock = threading.RLock()


class RenderUnavailable(RuntimeError):
    """缺少栅格化依赖（未安装 `.[render]`）"""


def available() -> bool:
    return importlib.util.find_spec("pypdfium2") is not None


def clamp_scale(scale: float) -> float:
    """限制缩放档位：既是质量下限，也防止有人拿超大 scale 把磁盘打满"""
    return max(MIN_SCALE, min(MAX_SCALE, round(float(scale), 2)))


def cache_path(data_root: Path, doc_id: str, page_idx: int, scale: float) -> Path:
    # data/ 已 gitignore；按 doc_id/scale 分目录，便于整目录失效
    return data_root / "pages" / doc_id / f"s{clamp_scale(scale)}" / f"{page_idx}.png"


# ── 按 bbox 取 PDF 自带文字层的文字 ──────────────────────────────────────
#
# 用途：切片对齐里「空文本的续排区域」过去只能按**几何位置猜**（MinerU 对跨栏段落只给一栏的
# bbox，另一栏记成空文本块）。现在改成从原文文字层把那个位置的**实际文字**取回来，
# 与切片正文比对 —— 对得上才收，于是"按位置补"变成**可验证**的结论，界面就能正常高亮。
#
# 坐标口径与 bbox 一致：`bbox` 每轴归一化到 0~1000，换算成 PDF 点后用**左下原点**取文
# （pdfium 的 `get_text_bounded` 用左下原点），实测 2025_婴幼儿过敏性疾病预防健康教育专家共识
# 第 1 页块 #12 取回「助于降低过敏的发生和严重程度……」，与该块位置印的字完全一致。
BBOX_SPACE = 1000
# 取文结果按 (文件, mtime, 页, bbox) 缓存：同一份文档在一次页面加载里会被问很多次
_TEXT_CACHE: dict[tuple, str] = {}
_TEXT_CACHE_MAX = 8192


def _cache_key(pdf_path: Path, page_idx: int, bbox: tuple[float, ...], space: int) -> tuple:
    try:
        mtime = pdf_path.stat().st_mtime_ns
    except OSError:
        mtime = 0
    return (str(pdf_path), mtime, int(page_idx), tuple(float(v) for v in bbox), int(space))


# ── 字符框级还原（修 MinerU 的 bbox 缺陷）────────────────────────────────
#
# 🚨 **`list` 块的 bbox 只覆盖第一条**：MinerU 把整条列表放进 `list_items`，而 `bbox` 只框住
# `list_items[0]`（实测 2025_婴幼儿…共识 #120/#123/#126 的 bbox 文字与 `list_items[0]` 逐字
# 相同，而列表分别有 9/27/12 条）。于是「参考文献」的高亮只亮出开头一点点。
#
# 这里把块的文字**在 PDF 里实际印到的位置**还原出来：拿该页文字层的字符框，从块的首字开始
# 顺次取够它的字数，按行聚类、按栏切段 —— 每段一个矩形。这样跨栏/跨页的列表也能整段高亮，
# 而且不依赖任何阈值猜测（字在哪儿就框在哪儿）。
# 「同一段」的判定：⚠️ 既不能用"x 区间是否重叠"（相邻词首尾相接，本来就不重叠），也不能只看
# 横向空隙 —— 实测参考文献的编号列（x 110~134）与正文列（155~485）之间空 21 个单位，
# 而**栏沟**才 23 个，两者几乎一样宽，任何单一空隙阈值都会切错。
# 换栏真正的特征是**阅读顺序里 y 回跳**（左栏读完落到底部，右栏从顶部重新开始），
# 所以用「y 不回跳 + 横向不至于远到另一处」两条一起判。
_Y_BACK_TOL = 10          # y 回跳超过它就认为是换栏
_X_GAP_WIDE = 80          # 横向相距超过它就肯定不是同一段
_RESYNC_MAX = 4           # 比对文字层时允许跳过的排版噪声字数（连字符 / 残留标记），见 _match_end
_WORD_CACHE: dict[tuple, tuple] = {}
_WORD_CACHE_MAX = 64


def _page_words(
    pdf_path: Path | str, page_idx: int, space: int
) -> tuple[tuple[str, float, float, float, float], ...]:
    """该页文字层的**词框**，按阅读顺序：`(归一化后的词, x1, y1, x2, y2)`（左上原点，0~space）。

    pdfium 的 `count_rects/get_rect` 给的就是这个粒度（实测 page 7 有 867 个），且**按阅读顺序**
    排列 —— 正好可以用来"顺着文字流找到某段话印在哪儿"。引文标记（`[9]`）会被剥掉：
    MinerU 把它们放在条目中间，PDF 里却在行首，不剥掉就对不上。按 (文件, mtime, 页) 缓存。
    """
    p = Path(pdf_path)
    key = (str(p), _cache_key(p, page_idx, (0.0, 0.0, 0.0, 0.0), space)[1], int(page_idx), int(space))
    if key in _WORD_CACHE:
        return _WORD_CACHE[key]

    if not available() or not p.is_file():
        return ()
    import pypdfium2 as pdfium

    out: list[tuple[str, float, float, float, float]] = []
    with _pdfium_lock:
        try:
            doc = pdfium.PdfDocument(str(p))
        except (pdfium.PdfiumError, FileNotFoundError, PermissionError):
            return ()
        try:
            page = doc[page_idx]
            w, h = page.get_size()
            tp = page.get_textpage()
            for i in range(tp.count_rects()):
                try:
                    left, bottom, right, top = tp.get_rect(i)
                    raw = tp.get_text_bounded(left=left, bottom=bottom, right=right, top=top)
                except (pdfium.PdfiumError, IndexError, TypeError, ValueError):
                    continue
                word = _plain(raw or "")
                if not word:
                    continue
                out.append((
                    word,
                    left / w * space,
                    (h - top) / h * space,      # pdfium 用左下原点，翻成左上原点
                    right / w * space,
                    (h - bottom) / h * space,
                ))
        finally:
            doc.close()
    res = tuple(out)
    if len(_WORD_CACHE) < _WORD_CACHE_MAX:
        _WORD_CACHE[key] = res
    return res


# ── 「被删掉的字」精确回位（2026-10-09，「清洗对比」左栏红框）─────────────────
#
# 与 `_page_words` 的差别：那是给"文本对齐校验"用的（剥引文标记、容忍噪声）；
# 这里要把**被清洗删掉的原文字**找出来 —— 引文标记（`[1-2]`）恰恰常是被删对象，
# 不能剥。所以另起一条**轻归一化**词流：只折叠全角、去空白，保留一切符号。
# （两条流各有一份缓存、各做一次 pdfium 取词；就本用例的页数量级，这点重复比
# 改 `_page_words` 的既有消费方安全 —— 它的剥记号行为是对齐校验的前提。）
_STREAM_CACHE: dict[tuple, tuple] = {}
_STREAM_CACHE_MAX = 64


def page_text_stream(
    pdf_path: Path | str, page_idx: int, space: int = BBOX_SPACE
) -> tuple[str, tuple[tuple[str, float, float, float, float], ...]]:
    """该页文字层的**轻归一化**词流：`(连接串, ((词, x1, y1, x2, y2), …))`（0~space，左上原点）。

    连接串 = 各词（折叠全角、去空白后）顺次拼接 —— 在它上面 `find` 目标串，再按各词的
    起止下标映射回矩形。按 (文件, mtime, 页) 缓存（与 `_page_words` 同款）。
    """
    p = Path(pdf_path)
    key = (str(p), _cache_key(p, page_idx, (0.0, 0.0, 0.0, 0.0), space)[1], int(page_idx), int(space))
    if key in _STREAM_CACHE:
        return _STREAM_CACHE[key]
    empty: tuple[str, tuple] = ("", ())
    if not available() or not p.is_file():
        return empty
    import pypdfium2 as pdfium

    words: list[tuple[str, float, float, float, float]] = []
    with _pdfium_lock:
        try:
            doc = pdfium.PdfDocument(str(p))
        except (pdfium.PdfiumError, FileNotFoundError, PermissionError):
            return empty
        try:
            page = doc[page_idx]
            w, h = page.get_size()
            tp = page.get_textpage()
            for i in range(tp.count_rects()):
                try:
                    left, bottom, right, top = tp.get_rect(i)
                    raw = tp.get_text_bounded(left=left, bottom=bottom, right=right, top=top)
                except (pdfium.PdfiumError, IndexError, TypeError, ValueError):
                    continue
                word = _fold_width(re.sub(r"\s+", "", raw or ""))
                if not word:
                    continue
                words.append((
                    word,
                    left / w * space,
                    (h - top) / h * space,      # pdfium 用左下原点，翻成左上原点
                    right / w * space,
                    (h - bottom) / h * space,
                ))
        finally:
            doc.close()
    res = ("".join(x[0] for x in words), tuple(words))
    if len(_STREAM_CACHE) < _STREAM_CACHE_MAX:
        _STREAM_CACHE[key] = res
    return res


def visible_for_pdf(s: str) -> str:
    """被删段在 PDF 上**印出来的样子**（用于在文字层里找它）。

    · 剥 HTML 标签：`<sup>a,b</sup>` → `a,b`（外壳不要、里子要）；
    · LaTeX 残渣取字母数字：`$\\mathbf{CER}^{2}$` → `CER2`、`$2 0 1 5^{7}$` → `20157`；
    · 其余原样（是否可定位由 `locate_printed_text` 的上下文判据把关，不在这里猜）。
    """
    s = re.sub(r"<[^<>]{0,32}>", "", s or "")
    s = re.sub(r"\\[a-zA-Z]+", "", s)
    s = re.sub(r"[\${}^_~]", "", s)
    return s


def _rect_for_chars(
    words: tuple[tuple[str, float, float, float, float], ...], lo: int, hi: int
) -> tuple[float, float, float, float] | None:
    """连接串的字符区间 `[lo, hi)` → 覆盖它的词们的并集矩形"""
    acc = 0
    sel: list[tuple[str, float, float, float, float]] = []
    for w in words:
        wl = len(w[0])
        if acc + wl <= lo:
            acc += wl
            continue
        if acc >= hi:
            break
        sel.append(w)
        acc += wl
    if not sel:
        return None
    return (
        min(s[1] for s in sel),
        min(s[2] for s in sel),
        max(s[3] for s in sel),
        max(s[4] for s in sel),
    )


def locate_printed_text(
    pdf_path: Path | str,
    page_idx: int,
    target: str,
    *,
    before_ctx: str = "",
    after_ctx: str = "",
    space: int = BBOX_SPACE,
    max_hits: int = 2,
) -> list[tuple[float, float, float, float]]:
    """把一段文字在页面上**实际印到的位置**找出来（词级 → 小矩形，0~space 坐标）。

    判据（宁可找不到、不猜错位）：
      · `before_ctx` 的尾巴 + `target` + `after_ctx` 的头在词流里**连续对上**（严格失败时
        放宽到 6~8 字的尾部/头部互证）；
      · **两侧上下文都存在时，两边都要证得上**（只证一边不算 —— 单字母 target 会被整页
        的巧合命中淹没：实测标题行被 pdfium 记成一整"词"，一个裸 "a" 就把标题框成 66% 宽）；
      · 只有一侧上下文时，以存在的那侧为准；完全无上下文（整行删除场景）接受首个出现。
    找不到返回 `[]` —— 调用方退回块级框。
    """
    want = re.sub(r"\s+", "", _fold_width(target))
    if not want:
        return []
    concat, words = page_text_stream(pdf_path, page_idx, space)
    if not concat:
        return []
    cb = re.sub(r"\s+", "", _fold_width(before_ctx))[-24:]
    ca = re.sub(r"\s+", "", _fold_width(after_ctx))[:24]

    hits: list[tuple[int, int]] = []
    start = 0
    while len(hits) < 64:
        pos = concat.find(want, start)
        if pos < 0:
            break
        start = pos + 1
        b_ok = (
            not cb
            or (pos >= len(cb) and concat[pos - len(cb):pos] == cb)
            or (pos >= 6 and concat[pos - 6:pos] == cb[-6:])
        )
        a_end = pos + len(want)
        a_ok = (
            not ca
            or concat[a_end:a_end + len(ca)] == ca
            or concat[a_end:a_end + 6] == ca[:6]
        )
        if not cb and not ca:
            ok = True                       # 无上下文（整行删除）：接受首个出现
        elif cb and ca:
            ok = b_ok and a_ok              # 两侧都证得上才算 —— 见 docstring
        else:
            # 只有一侧：**只认存在的那一侧**（缺的一侧不算数！）
            # ⚠️ 别写成 `b_ok or a_ok` —— b_ok/a_ok 自带"该侧为空即恒真"的短路，
            # 缺一侧时 or 会恒真，把全部裸匹配放进来（实测把标题框成 66% 宽）。
            ok = b_ok if cb else a_ok
        if not ok:
            continue
        hits.append((0, pos))
        if not cb and not ca and len(hits) >= max_hits:
            break
    if not hits:
        return []
    hits.sort()
    out: list[tuple[float, float, float, float]] = []
    for _score, pos in hits[:max_hits]:
        rect = _rect_for_chars(words, pos, pos + len(want))
        if rect is None:
            continue
        x1, y1, x2, y2 = rect
        # 粒度过滤：pdfium 有时把**一整行**融合成一个"词"（实测标题行/长句）
        # —— 目标的字符数换算出的期望宽度远小于矩形时，说明拿到的是行级融合框，
        # 粒度不达标：宁可不画（退回块级回退框），也不给一个"整行那么宽"的假精确框。
        if (x2 - x1) > max(56.0, len(want) * 20.0):
            continue
        pad = 2.0                        # 极小的上标字给点余量，前端好看也好点
        out.append((
            max(0.0, x1 - pad),
            max(0.0, y1 - pad),
            min(float(space), x2 + pad),
            min(float(space), y2 + pad),
        ))
    return out


def _merge_words(
    words: list[tuple[str, float, float, float, float]],
) -> list[tuple[float, float, float, float]]:
    """词框 → 矩形：顺着阅读顺序合并，**碰到换栏就断开**（见上面 `_Y_BACK_TOL` 的说明）"""
    out: list[list[float]] = []
    for _t, x1, y1, x2, y2 in words:
        if out:
            prev = out[-1]
            gap = max(x1 - prev[2], prev[0] - x2)        # 有重叠时为负
            if y1 >= prev[1] - _Y_BACK_TOL and gap <= _X_GAP_WIDE:
                prev[0] = min(prev[0], x1)
                prev[1] = min(prev[1], y1)
                prev[2] = max(prev[2], x2)
                prev[3] = max(prev[3], y2)
                continue
        out.append([x1, y1, x2, y2])
    return [(a, b, c, d) for a, b, c, d in out]


# 全角 ASCII（含全角空格）→ 半角。**长度不变**，所以下标可以直接换算。
# 中文 PDF 的文字层很常这么排：同一段里数字/字母是全角（`１７，１９ ２０］`），
# MinerU 侧却是半角（`17，19 20］`）—— 不折一下，比对会在这里断掉，
# 于是"其实整段都在本页"的块被判成"本页只有开头"（实测 CMPA 指南 #36）。
_FOLD_WIDTH = {c: c - 0xFEE0 for c in range(0xFF01, 0xFF5F)}
_FOLD_WIDTH[0x3000] = 0x20


def _fold_width(s: str) -> str:
    return s.translate(_FOLD_WIDTH)


def _resync(hay: str, i: int, want: str, j: int) -> tuple[int, int] | None:
    """对不上时，找一个"两侧各跳几个字又能接着对上"的位置；找不到返回 None。

    ⚠️ **两侧都要能跳**（只跳一侧修不了实测里最常见的两类噪声）：
    · 文字层多出字符：控制字符 `\\x02`（实测 NIAID/共识的参考文献）、全角/零宽字符；
    · **块文字**多出字符：md 里的转义反斜杠（`\\~3d` ↔ 原文 `~3d`，实测共识 #63 与参考文献条目）。
    跳完必须**连续对上 2 个字**才认，且取总跳格数最小的方案 —— 免得把真正的错位当噪声放过去。
    """
    best: tuple[int, int, int] | None = None
    for dh in range(_RESYNC_MAX + 1):
        if i + dh >= len(hay):
            break
        for dw in range(_RESYNC_MAX + 1):
            if not (dh or dw) or j + dw >= len(want):
                continue
            if hay[i + dh] != want[j + dw] or hay[i + dh : i + dh + 2] != want[j + dw : j + dw + 2]:
                continue
            if best is None or dh + dw < best[0]:
                best = (dh + dw, i + dh, j + dw)
    return None if best is None else (best[1], best[2])


def _match_end(hay: str, pos: int, want: str) -> int:
    """`hay[pos:]` 与 `want` **连续对得上**的那一段，在 `hay` 里的结束下标（半开）。

    引文标记（`[1-2]` —— MinerU 记在条目中间、PDF 里印在行首）与 ≤`_RESYNC_MAX` 个字的
    排版噪声（连字符、残留尖括号）允许跳过；**再对不上就到此为止**，不顺着阅读顺序继续往后吞字。

    🚨 为什么必须有这条边界（实测踩过）：`text_regions` 过去是**按字数**在阅读顺序里硬走的
    （`hi = 起点 + len(want)`）。块文字比本页印出来的长时 —— 段落跨页、MinerU 把两页并成一个块 ——
    多取的字会落到**页脚、页眉、页码**上，`_merge_words` 一合并就是**整页那么大的假框**：
    `2025_婴幼儿过敏性疾病预防健康教育专家共识` 块 #11（本页只印到 162/392 字）框出
    `[213, 75, 893, 926]`、块 #72 框出 `[109, 75, 788, 926]` —— 界面上就是"一个特别大的错误高亮区"，
    把标题、摘要、页眉、页码全罩进去了。
    """
    hay, want = _fold_width(hay), _fold_width(want)   # 全角/半角差异不该算"对不上"
    i, j = pos, 0
    n, m = len(hay), len(want)
    while j < m:
        if i < n and hay[i] == want[j]:
            i += 1
            j += 1
            continue
        cite = _CITE_RE.match(hay, i)          # 整段引文标记直接跳过
        if cite is not None and cite.end() > i:
            i = cite.end()
            continue
        nxt = _resync(hay, i, want, j)         # 少量排版噪声：两侧各跳几个字再接着比
        if nxt is None:
            break                              # 真的对不上了 → 本页印到这儿为止
        i, j = nxt
    return i


def text_regions(
    pdf_path: Path | str,
    page_idx: int,
    text: str,
    *,
    skip_chars: int = 0,
    space: int = BBOX_SPACE,
    max_rects: int = 4,
) -> list[tuple[float, float, float, float]]:
    """`text`（跳过前 `skip_chars` 个字）在页面上**实际印到**的矩形。

    ⚠️ **粒度按调用方给的一段文字**：给一条参考文献就返回那一条的框（通常是 1 个，
    跨栏才 2 个）。定位不到（空格/连字符差异太大）返回 `[]` —— 调用方据此**退回原 bbox**，不猜。

    ⚠️ 文字**跨页**时（本页只印了一半）返回的是**本页印到的那部分**，不越界去吞页脚/页眉 ——
    见 `_match_end` 的说明。
    """
    want = _plain(text)
    if len(want) < 8:
        return []
    words = _page_words(pdf_path, page_idx, space)
    if not words:
        return []
    page_norm = "".join(w[0] for w in words)

    pos = -1
    for probe in (24, 16, 10):          # 前缀逐步放宽：排版差异只影响局部
        pos = page_norm.find(want[:probe])
        if pos >= 0:
            break
    if pos < 0:
        return []

    # 归一化下标 → 词下标（每个词的长度都 ≥1）
    lo_w = 0
    acc = 0
    target = pos + max(0, skip_chars)
    for idx, w in enumerate(words):
        if acc + len(w[0]) > target:
            lo_w = idx
            break
        acc += len(w[0])
        lo_w = idx + 1

    # 终点由**文字本身**定：连续对得上多少就取多少（跨页时只取本页印到的那段）。
    # 不要写回 `pos + len(want)` —— 那正是巨型假框的来源，见 `_match_end`。
    hi_norm = _match_end(page_norm, pos, want)
    hi_w = lo_w
    acc = sum(len(w[0]) for w in words[:lo_w])
    while hi_w < len(words) and acc < hi_norm:
        acc += len(words[hi_w][0])
        hi_w += 1
    # 末词只有**一小截**落在匹配区间里 → 丢掉整个词。
    # 匹配在词中间断掉，多半是页眉/页脚里碰巧印着同样的两三个字（实测共识 #72 匹配到句尾的
    # 「…可选择使用符**中国**」就断在页眉的「中国妇幼卫生杂志」上，整词收进来会框到页眉）。
    if hi_w > lo_w:
        last_len = len(words[hi_w - 1][0])
        if acc - hi_norm > last_len / 2:
            hi_w -= 1

    if hi_w - lo_w < 2:
        return []
    return _merge_words(list(words[lo_w:hi_w]))[:max_rects]


def text_in_bboxes(
    pdf_path: Path | str,
    jobs: list[tuple[int, tuple[float, float, float, float]]],
    space: int = BBOX_SPACE,
) -> list[str]:
    """按 `[(page_idx, bbox), ...]` 批量取 PDF 文字层里该位置的文字，返回等长列表。

    任一项取不到（文件缺失、页码越界、`bbox` 不合法、无文字层）时，该项返回 `""` ——
    调用方据此**放弃校验**而不是判为"不匹配"，避免把"读不到"当成"对不上"。
    缺依赖（未装 `.[render]`）时全部返回 `""`。
    """
    if not jobs or not available():
        return ["" for _ in jobs]
    p = Path(pdf_path)
    if not p.is_file():
        return ["" for _ in jobs]

    keys = [_cache_key(p, pg, bb, space) for pg, bb in jobs]
    out: list[str] = [_TEXT_CACHE.get(k, "") for k in keys]
    todo = [(idx, k) for idx, k in enumerate(keys) if k not in _TEXT_CACHE]
    if not todo:
        return out

    import pypdfium2 as pdfium

    with _pdfium_lock:      # 见文件顶部：pdfium 非线程安全，必须串行
        try:
            doc = pdfium.PdfDocument(str(p))
        except (pdfium.PdfiumError, FileNotFoundError, PermissionError):
            return out      # 文档打不开（损坏 / 加密 / 无权限）→ 全空，交给调用方放弃校验
        try:
            textpages: dict[int, object] = {}
            sizes: dict[int, tuple[float, float]] = {}
            for idx, key in todo:
                page_idx, bbox = key[2], key[3]
                try:
                    if page_idx not in textpages:
                        page = doc[page_idx]
                        textpages[page_idx] = page.get_textpage()
                        sizes[page_idx] = page.get_size()
                    w, h = sizes[page_idx]
                    x1, y1, x2, y2 = bbox
                    txt = textpages[page_idx].get_text_bounded(
                        left=x1 * w / space,
                        bottom=h - y2 * h / space,     # pdfium 用左下原点，y 要翻过来
                        right=x2 * w / space,
                        top=h - y1 * h / space,
                    )
                except (pdfium.PdfiumError, IndexError, TypeError, ValueError):
                    txt = ""        # 页码越界 / bbox 不合法 / 无文字层 → 该项留空
                txt = txt or ""
                if len(_TEXT_CACHE) < _TEXT_CACHE_MAX:
                    _TEXT_CACHE[key] = txt
                out[idx] = txt
        finally:
            doc.close()
    return out


def render_page_png(pdf_path: Path, data_root: Path, doc_id: str, page_idx: int, scale: float = DEFAULT_SCALE) -> Path:
    """把第 `page_idx` 页（0 基）渲成 PNG 并返回缓存路径；命中磁盘缓存则直接返回。

    原子写：先写 `.tmp` 再 `replace`，避免并发请求/中断留下半张图。
    """
    scale = clamp_scale(scale)
    out = cache_path(data_root, doc_id, page_idx, scale)
    if out.is_file() and out.stat().st_size > 0:
        return out

    if not available():
        raise RenderUnavailable(
            "缺少栅格化依赖。安装：cd minicare-platform/api && .venv/bin/pip install -e \".[render]\""
        )

    import pypdfium2 as pdfium

    from .fsutil import ensure_dir

    with _pdfium_lock:      # 见文件顶部：pdfium 非线程安全，必须串行
        doc = pdfium.PdfDocument(str(pdf_path))
        try:
            total = len(doc)
            if not 0 <= page_idx < total:
                raise IndexError(f"页码越界: {page_idx}（共 {total} 页）")
            page = doc[page_idx]
            img = page.render(scale=scale).to_pil()
        finally:
            doc.close()

    ensure_dir(out.parent)
    tmp = out.with_name(out.name + ".tmp")
    img.save(tmp, "PNG", optimize=True)
    tmp.replace(out)
    return out
