"""正文清洗的行级对照（「清洗对比」工作台页签的数据源）

推导完全复用 normalize 产物里的 `line_map`（输出第 i 行 ← 原始 md 第 `line_map[i]` 行），
**不做文本 diff 匹配** —— 文本匹配在标题改写场景下会错配（切片对齐的旧方案实测只有
88.5% 准确率），行号链是 100%。这两个消费点（切片对照 / 清洗对比）吃的是同一套结论。

行分类（按**原始 md 的行序**排列，用户对着原文看）：
  · keep     保留  —— 原样进入产物（含"仅空白差异"：行尾空格 / 缩进被压缩，不算变化）
  · changed  修改  —— 内容变化（标题层级修复、去引用上标、图片补题注、公式清理…）
  · removed  删除  —— 原始行未进入产物（期刊页眉页脚行、纯页码行等）
  · blank    空行  —— 被压缩掉的空行（连续多个聚合为一条 —— 它对用户只是噪声，不该刷屏）

changed 行额外携带**字符级差段**（`before_parts` / `after_parts`，2026-10-09 加）：
把"哪些字被清洗掉了"直接在原文里标出来（红删 / 蓝增），不再让用户肉眼比对两行长句。
⚠️ 差段在服务端就切好（`{"t": 文本, "m": 0|1}`），**不传索引** —— 前端若按 UTF-16 码元
切字符串会与 Python 码点错位（非 BMP 字符）。stats 另附字级口径（删/增字符数 + 分类计数）。

⚠️ 本模块只读不改：不重跑 normalize，也不修改任何产物（旧产物缺 line_map 时如实返回
不可用原因，绝不退回文本匹配猜一个"看起来对"的答案）。

⚠️ 行号链的可信前提是"清洗各步逐行保序"（行结构不变）。clean.py 已加防御断言；
2026-10-09 之前 HEADER_FOOTER_RE 跨行吞换行 + 误伤参考文献，本对照曾出现成片
"幻影增删"（《共识》文档实测 311 行里 106 行错位）—— 修复与回归见 clean.py 与
tests/test_clean.py，重跑受影响文档需同时升 `normalize@v4` 缓存标记。
"""
from __future__ import annotations

import difflib
import re

_WS_RE = re.compile(r"\s+")

# 差段分类（喂"字级口径"）。按**删除段**判定，优先序：上标 > 公式 > 纯空白 > 其他。
_SUP_ANY_RE = re.compile(r"<sup>.*?</sup>")
_FORMULA_RE = re.compile(r"\$|\\[a-zA-Z]")


def _flat(s: str) -> str:
    """去空白后比较 —— 纯空白差异（行尾空格、缩进、连续空格压缩）不算「修改」。"""
    return _WS_RE.sub("", s)


def _is_heading(s: str) -> bool:
    return s.lstrip().startswith("#")


def _char_diff(before: str, after: str) -> tuple[list[dict], list[dict], dict]:
    """字符级 diff → 两串差段 + 分类计数。

    段结构 `{"t": 文本, "m": 0|1}`（m=1 = 被清洗掉 / 新增），相邻同类段自动合并。
    计数键：`del_sup / del_formula / del_space / del_other`（删除段四类）、
    `ins_alt`（图注补「图」）/ `ins_heading`（标题井号 `###`）/ `ins_other`、
    `del_chars / ins_chars`（字符总数）。

    `autojunk=False`：默认的"流行元素当垃圾跳掉"会在长行（表格 HTML 等）上给出
    看似合理实则错位的对齐，这里要的是忠实最小编辑，多余的性能开销可接受。
    """
    sm = difflib.SequenceMatcher(None, before, after, autojunk=False)

    def push(parts: list[dict], text: str, m: int) -> None:
        if not text:
            return
        if parts and parts[-1]["m"] == m:
            parts[-1]["t"] += text
        else:
            parts.append({"t": text, "m": m})

    b_parts: list[dict] = []
    a_parts: list[dict] = []
    cnt = {
        "del_chars": 0,
        "ins_chars": 0,
        "del_sup": 0,
        "del_formula": 0,
        "del_space": 0,
        "del_other": 0,
        "ins_alt": 0,
        "ins_heading": 0,
        "ins_other": 0,
    }

    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            push(b_parts, before[i1:i2], 0)
            push(a_parts, after[j1:j2], 0)
            continue
        if op in ("delete", "replace"):
            seg = before[i1:i2]
            push(b_parts, seg, 1)
            cnt["del_chars"] += len(seg)
            if _SUP_ANY_RE.search(seg):
                cnt["del_sup"] += 1
            elif _FORMULA_RE.search(seg):
                cnt["del_formula"] += 1
            elif not seg.strip():
                cnt["del_space"] += 1
            else:
                cnt["del_other"] += 1
        if op in ("insert", "replace"):
            seg = after[j1:j2]
            push(a_parts, seg, 1)
            cnt["ins_chars"] += len(seg)
            s = seg.strip()
            if s == "图":
                cnt["ins_alt"] += 1
            elif s and set(s) == {"#"}:
                cnt["ins_heading"] += 1
            elif s:
                cnt["ins_other"] += 1
    return b_parts, a_parts, cnt


def build_normalize_diff(raw_md: str, norm_md: str, line_map: list[int]) -> dict:
    """生成逐行对照表。

    Returns::

        {
          "ready": True,
          "raw_chars": int, "md_chars": int,   # 字符数统计（含空格换行，与产物 stats 口径一致）
          "raw_lines": int, "out_lines": int,
          "stats": {keep, changed, removed, blank_compressed, headings,      # 行级
                    del_chars, ins_chars,                                    # 字级：删/增字符数
                    del_sup, del_formula, del_space, del_other,              # 字级：删除分类
                    ins_alt, ins_heading, ins_other},                        # 字级：新增分类
          "lines": [ {"type": "keep", "src": 1, "text": "..."},
                     {"type": "changed", "src": 2, "before": "...", "after": "...", "kind": "标题",
                      "before_parts": [{"t": "...", "m": 0|1}, …],
                      "after_parts":  [{"t": "...", "m": 0|1}, …]},
                     {"type": "removed", "src": 3, "text": "..."},
                     {"type": "blank", "count": 3}, ... ]
        }

    前置不满足（缺 line_map / 行数不一致 / 行号越界）时返回 ``{"ready": False, "reason": str}``。
    """
    raw_lines = raw_md.splitlines()
    out_lines = norm_md.splitlines()

    if not line_map:
        return {"ready": False, "reason": "该文档的清洗产物没有行号映射（旧版产物）"}
    if len(line_map) != len(out_lines):
        return {
            "ready": False,
            "reason": (
                f"行号映射与产物行数不一致（映射 {len(line_map)} 行 vs 产物 {len(out_lines)} 行），"
                "产物可能被人工改动过"
            ),
        }

    out_by_src: dict[int, int] = {}
    for oi, si in enumerate(line_map):
        if not isinstance(si, int) or not (0 <= si < len(raw_lines)):
            return {"ready": False, "reason": "行号映射越界（产物与原始 md 不匹配）"}
        out_by_src[si] = oi

    items: list[dict] = []
    stats = {
        "keep": 0,
        "changed": 0,
        "removed": 0,
        "blank_compressed": 0,
        "headings": 0,
        "del_chars": 0,
        "ins_chars": 0,
        "del_sup": 0,
        "del_formula": 0,
        "del_space": 0,
        "del_other": 0,
        "ins_alt": 0,
        "ins_heading": 0,
        "ins_other": 0,
    }
    blank_run = 0

    def flush_blank() -> None:
        nonlocal blank_run
        if blank_run:
            items.append({"type": "blank", "count": blank_run})
            stats["blank_compressed"] += blank_run
            blank_run = 0

    for si, raw_ln in enumerate(raw_lines):
        oi = out_by_src.get(si)
        if oi is None:
            if not raw_ln.strip():
                blank_run += 1
            else:
                flush_blank()
                items.append({"type": "removed", "src": si + 1, "text": raw_ln})
                stats["removed"] += 1
            continue

        flush_blank()
        new = out_lines[oi]
        if new == raw_ln or _flat(new) == _flat(raw_ln):
            items.append({"type": "keep", "src": si + 1, "text": new})
            stats["keep"] += 1
        else:
            kind = "标题" if (_is_heading(new) or _is_heading(raw_ln)) else "修改"
            if kind == "标题":
                stats["headings"] += 1
            b_parts, a_parts, cnt = _char_diff(raw_ln, new)
            for k, v in cnt.items():
                stats[k] += v
            items.append(
                {
                    "type": "changed",
                    "src": si + 1,
                    "before": raw_ln,
                    "after": new,
                    "kind": kind,
                    "before_parts": b_parts,
                    "after_parts": a_parts,
                }
            )
            stats["changed"] += 1
    flush_blank()

    return {
        "ready": True,
        "raw_chars": len(raw_md),
        "md_chars": len(norm_md),
        "raw_lines": len(raw_lines),
        "out_lines": len(out_lines),
        "stats": stats,
        "lines": items,
    }
