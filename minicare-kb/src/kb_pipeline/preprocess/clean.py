"""清洗：去 <sup> 引用、页眉页脚、空白压缩、图片引用归一"""
from __future__ import annotations

import re

# 页眉/页脚/卷期行（期刊信息，如"中华预防医学杂志 2025 年 6 月第 59 卷第 6 期　Chin J Prev Med…"）
HEADER_FOOTER_RE = re.compile(
    r"^\s*(中华[^。\n]*杂志|Chinese Journal[^\n]*|Vol\.\s*\d+[^\n]*|第\s*\d+\s*卷[^\n]*)"
    r"|^\s*·\d+\s*·\s*$"  # 孤立页码 ·354·
    r"|^\s*第\s*\d+\s*页\s*$",
    re.MULTILINE,
)

SUP_RE = re.compile(r"<sup>.*?</sup>")
IMG_REF_RE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")
WS_RE = re.compile(r"[ \t\u3000]+")
# LaTeX 公式残留（MinerU 公式识别输出，中文文档里是噪声）：$...$ 行内公式、\mathbf 等命令
LATEX_RE = re.compile(r"\$[^$]*\$|\\[a-zA-Z]+\s*\{[^}]*\}|\\[a-zA-Z]+")


def clean_text(text: str) -> str:
    """整体清洗（块级用 clean_line）"""
    text = SUP_RE.sub("", text)  # 去引用上标
    text = HEADER_FOOTER_RE.sub("", text)  # 去页眉页脚/卷期
    text = IMG_REF_RE.sub(lambda m: f"【图:{m.group(1) or '无题' }】", text)  # 图片引用归一
    text = LATEX_RE.sub("", text)  # 去 LaTeX 公式残留
    lines = [WS_RE.sub(" ", ln).strip() for ln in text.splitlines()]
    # 压缩连续空行
    out: list[str] = []
    prev_blank = False
    for ln in lines:
        if ln:
            out.append(ln)
            prev_blank = False
        elif not prev_blank:
            out.append("")
            prev_blank = True
    return "\n".join(out).strip()


def clean_line(line: str) -> str:
    """行级清洗（切块前逐行）"""
    line = SUP_RE.sub("", line)
    line = LATEX_RE.sub("", line)
    line = WS_RE.sub(" ", line)
    return line.strip()
