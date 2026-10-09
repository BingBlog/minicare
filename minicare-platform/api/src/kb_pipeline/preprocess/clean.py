"""清洗：去 <sup> 引用、页眉页脚、空白压缩、图片引用补缺省 alt"""
from __future__ import annotations

import re

# 页眉/页脚/卷期行（期刊信息，如"中华预防医学杂志 2025 年 6 月第 59 卷第 6 期　Chin J Prev Med…"）
#
# ⚠️ 2026-10-09（normalize@v4）修掉两处坑，改这条规则前先把两条规矩抄在心里：
#   ① **正则不得跨行**（不许吞/造换行）。原版 `^\s*` 的 `\s` 含换行，匹配时会吃掉
#      前一个空行的换行符 → `src = text.splitlines()` 的行结构变化 → line_map 的
#      行号坐标系与原始 md 脱钩，下游行号链（清洗对比 / 切片精确对齐）整体错位。
#   ② 「中华…杂志」不能只看开头。参考文献常以编辑部名义开头、行内又出现期刊名
#      （如「中华儿科杂志编辑委员会，…[J]. 中华儿科杂志，2019（3）：164-171.」），
#      原版贪婪 `[^。\n]*` 会吃到行内最后一个"杂志"，把条目头整段断头
#      —— 实测误伤《2025_婴幼儿过敏性疾病预防健康教育专家共识》3 条文献。
#   现在限定：中华到杂志的跨度 ≤10 字，且**名字后紧跟卷期/年份线索**
#   （空白后是 4 位年 / 第N卷 / Vol. / Chin）才判为页眉。
#   回归样例见 tests/test_clean.py::test_header_does_not_eat_reference_entries。
HEADER_FOOTER_RE = re.compile(
    r"^[ \t\u3000]*中华[^。\n]{0,10}?杂志(?=[ \t\u3000]*(?:\d{4}|第[ \t\u3000]*\d|Vol\.|Chin))"
    r"|^[ \t\u3000]*Chinese Journal[^\n]*"
    r"|^[ \t\u3000]*Vol\.[ \t\u3000]*\d+[^\n]*"
    r"|^[ \t\u3000]*第[ \t\u3000]*\d+[ \t\u3000]*卷[^\n]*"
    r"|^[ \t\u3000]*·[ \t\u3000]*\d+[ \t\u3000]*·[ \t\u3000]*$"  # 孤立页码 ·354·
    r"|^[ \t\u3000]*第[ \t\u3000]*\d+[ \t\u3000]*页[ \t\u3000]*$",
    re.MULTILINE,
)

SUP_RE = re.compile(r"<sup>.*?</sup>")
IMG_REF_RE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")
WS_RE = re.compile(r"[ \t\u3000]+")
# LaTeX 公式残留（MinerU 公式识别输出，中文文档里是噪声）：$...$ 行内公式、\mathbf 等命令
LATEX_RE = re.compile(r"\$[^$]*\$|\\[a-zA-Z]+\s*\{[^}]*\}|\\[a-zA-Z]+")


def clean_text_with_map(text: str) -> tuple[str, list[int]]:
    """与 `clean_text` 同结果，但额外返回**行映射**：输出第 i 行来自输入的第 `line_map[i]` 行。

    为什么需要它：切块现在要为每个切片记录 `line_start/line_end`（把切片精确锚回原文块），
    而本函数会**压缩连续空行**（真的丢行）并 strip 首尾空行 —— 行号不再一一对应。
    没有这张映射，切片的行号就无法换算回原始 md，精确对齐就无从谈起。

    ⚠️ 除本函数外，`infer_plain_headings` / `fix_heading_levels` / `_extract_tables` 都必须
    **逐行保序**（一行进一行出）。切块侧会校验行数，一旦不成立就放弃行号（退化为按页码定位），
    而不是给一个看起来对的错答案。

    本函数自己的四个正则 sub 同样必须**逐行保序** —— 见下方防御断言（2026-10-09 加）。
    """
    n_lines_in = len(text.splitlines())
    text = SUP_RE.sub("", text)  # 去引用上标
    text = HEADER_FOOTER_RE.sub("", text)  # 去页眉页脚/卷期（只删行内容，保留换行 → 行数不变）
    # 图片引用：**保留 `![](路径)`**，只给缺 alt 的图补一个「图」。
    # ⚠️ 这里以前是把整条压成 `【图:无题】` 纯文本的（v2 及更早）—— 路径一丢，产物里就再也
    # 找不回图片，前端只能显示一行无字可点的提示（2026-10-05 用户报"图片未显示"）。
    # 代价是切片正文多出 `![](images/<sha>.jpg)`，实测全库占比 ≤3.4%（多数 <1%）；
    # 换来的是图**能渲染**，且 MinerU 给的图注（alt）照样留在正文里可被检索。
    text = IMG_REF_RE.sub(lambda m: f"![{m.group(1) or '图'}]({m.group(2)})", text)
    text = LATEX_RE.sub("", text)  # 去 LaTeX 公式残留
    # ── 防御性不变式（2026-10-09，normalize@v4）──────────────────────────────
    # 上面四个 sub 都**不得改变行结构**：本函数产出的 line_map 是下游一切"行号链"的
    # 坐标系（清洗对比 / 切片精确对齐）。若某条规则跨行吞/造了换行，行号会与原始 md
    # 静默漂移 —— 宁可当场炸掉，也不给下游一个"看起来对"的错答案。
    # （历史事故：HEADER_FOOTER_RE 的 `^\s*` 吃掉空行换行，全篇 line_map 错位。）
    if len(text.splitlines()) != n_lines_in:
        raise ValueError(
            f"清洗正则改变了行结构（{n_lines_in} 行 → {len(text.splitlines())} 行）："
            "SUP / HEADER_FOOTER / IMG_REF / LATEX 中疑似有跨行匹配。"
            "这会令 line_map 与原始 md 行号脱钩，必须先修规则再跑。"
        )
    src = text.splitlines()
    lines = [WS_RE.sub(" ", ln).strip() for ln in src]
    # 压缩连续空行（这里会丢行 —— 必须同步记录来源行号）
    out: list[str] = []
    line_map: list[int] = []
    prev_blank = False
    for i, ln in enumerate(lines):
        if ln:
            out.append(ln)
            line_map.append(i)
            prev_blank = False
        elif not prev_blank:
            out.append("")
            line_map.append(i)
            prev_blank = True
    # 与 clean_text 的 .strip() 对齐：去掉首尾空行，line_map 同步裁剪
    while out and out[0] == "":
        out.pop(0)
        line_map.pop(0)
    while out and out[-1] == "":
        out.pop()
        line_map.pop()
    return "\n".join(out), line_map


def clean_text(text: str) -> str:
    """整体清洗（块级用 clean_line）"""
    return clean_text_with_map(text)[0]


def clean_line(line: str) -> str:
    """行级清洗（切块前逐行）"""
    line = SUP_RE.sub("", line)
    line = LATEX_RE.sub("", line)
    line = WS_RE.sub(" ", line)
    return line.strip()
