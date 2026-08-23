"""标题层级修复：MinerU 把所有标题输出为 ##，按编号规则恢复 h2/h3/h4/h5

规则：
- ^## + [一二三四五六七八九十]+、        → h2（章节，如 "一、定义"）
- ^## + （[一二三四五六七八九十]+）      → h3（子节，如 "（一）IgE介导"）
- ^## + 数字.                            → h4（如 "1. 制定背景"、"2.特殊人群"）
- ^## + 数字.数字                        → h5（如 "3.1 遗传因素"）
- 其它（执笔人/参考文献/摘要等）         → 保持 h2，但不参与章节树（chunking 阶段按类型过滤）
"""
from __future__ import annotations

import re

# 顺序重要：先匹配更具体的
_H2_CN = re.compile(r"^##\s+[一二三四五六七八九十]+、")
_H3_CN = re.compile(r"^##\s+（[一二三四五六七八九十]+）")
_H5_NUM = re.compile(r"^##\s+\d+[\.．]\d+")
_H4_NUM = re.compile(r"^##\s+\d+[\.．]")


def fix_heading_levels(md_text: str) -> str:
    """返回修复层级后的 md 文本（## 一、 → ##；## （一） → ###；…）"""
    out: list[str] = []
    for line in md_text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("## "):
            if _H5_NUM.match(stripped):
                out.append("##### " + stripped[3:])
            elif _H4_NUM.match(stripped):
                out.append("#### " + stripped[3:])
            elif _H3_CN.match(stripped):
                out.append("### " + stripped[3:])
            elif _H2_CN.match(stripped):
                out.append("## " + stripped[3:])
            else:
                # 其他 ##（摘要/执笔人/参考文献等）保留原样
                out.append(stripped)
        else:
            out.append(line)
    return "\n".join(out)


def heading_level(line: str) -> int:
    """获取行标题级别（0=非标题）"""
    stripped = line.lstrip()
    if not stripped.startswith("#"):
        return 0
    return len(stripped) - len(stripped.lstrip("#"))


# HTML 产物兼容：正文标题无 # 前缀，按编号模式 + 短行识别
# 识别：^一、 / ^（一）/^（1） / ^1. / ^2. / ^① 等编号开头 + 行短（<30 字）→ 视为标题
_PLAIN_CN_SEC = re.compile(r"^[一二三四五六七八九十]+、")
_PLAIN_CN_SUB = re.compile(r"^（[一二三四五六七八九十]+）")
_PLAIN_NUM_SUB = re.compile(r"^（\d+）")
_PLAIN_NUM = re.compile(r"^\d+[\.．、]")
_PLAIN_NUM_DOT = re.compile(r"^\d+[\.．]\d+")
_PLAIN_CN_NUM = re.compile(r"^[①②③④⑤⑥⑦⑧⑨⑩]")


def infer_plain_headings(md_text: str, max_title_len: int = 30) -> str:
    """为无 # 前缀的编号短行补 ## 前缀（HTML 产物 MinerU-HTML 丢失标题标记）。

    仅当行以编号模式开头、总长 ≤ max_title_len 且不含句号（排除正文句子）时判定为标题。
    分级：一、→## ｜ （一）/（1）→### ｜ 1.1→#### ｜ 1.→### ｜ ①→h3
    """
    out: list[str] = []
    for line in md_text.splitlines():
        stripped = line.strip()
        if (
            stripped
            and not stripped.startswith("#")
            and len(stripped) <= max_title_len
            and "。" not in stripped
            and "，" not in stripped
            and "：" not in stripped
        ):
            if _PLAIN_NUM_DOT.match(stripped):
                out.append("#### " + stripped)
                continue
            if _PLAIN_CN_SUB.match(stripped) or _PLAIN_NUM_SUB.match(stripped):
                out.append("### " + stripped)
                continue
            if _PLAIN_CN_SEC.match(stripped) or _PLAIN_NUM.match(stripped):
                out.append("## " + stripped)
                continue
            if _PLAIN_CN_NUM.match(stripped):
                out.append("### " + stripped)
                continue
        out.append(line)
    return "\n".join(out)
