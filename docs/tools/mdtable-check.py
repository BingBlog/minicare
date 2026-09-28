#!/usr/bin/env python3
"""
Markdown 表格断表自检（断表四类中的"格数不齐"与"分隔行缺失"）。

为什么需要它：PRD/技术文档靠表格承载口径，一旦某行格数与表头不一致，
渲染时整张表会错列甚至断成两段，而肉眼极难发现。

关键细节：**不能简单地按 `|` 切分**。单元格里的 `\\|`（转义竖线）与
行内代码 `` `a|b` `` 都是合法内容，粗匹配会把它们算成列分隔符 → 误报
（曾据此误判 PRD §7.6.1 的 3 列表格为断表）。

用法：
  python3 docs/tools/mdtable-check.py <file.md> [more.md ...]
  python3 docs/tools/mdtable-check.py docs/prd/PRD-006/*.md
退出码：0 = 全部通过；1 = 有可疑表格。
"""
import re
import sys
from pathlib import Path

SEP = re.compile(r'^\|[-|: ]*\|$')


def split_row(line: str):
    """按真正的列分隔符切分：先把转义竖线与行内代码内的竖线占位。"""
    s = line.strip()
    # 行内代码里的竖线 → 占位符（成对反引号）
    s = re.sub(r'`[^`]*`', lambda m: m.group(0).replace('|', '\x00'), s)
    s = s.replace('\\|', '\x00')
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return s.split('|')


def check(path: Path):
    lines = path.read_text(encoding='utf-8').split('\n')
    problems, tables, i = [], 0, 0
    while i < len(lines):
        if lines[i].strip().startswith('|') and i + 1 < len(lines) and SEP.match(lines[i + 1].strip()):
            tables += 1
            head = split_row(lines[i])
            n = len(head)
            j = i + 2
            rows = 0
            while j < len(lines) and lines[j].strip().startswith('|'):
                cells = split_row(lines[j])
                if len(cells) != n:
                    problems.append((tables, j + 1, n, len(cells), lines[j].strip()[:60]))
                rows += 1
                j += 1
            if rows == 0:
                problems.append((tables, i + 1, n, 0, '（表头后无数据行）'))
            i = j
        else:
            i += 1
    return tables, problems


def main(argv):
    files = []
    for a in argv[1:]:
        p = Path(a)
        if p.is_dir():
            files += sorted(p.glob('*.md'))
        elif p.exists():
            files.append(p)
        else:
            print(f'跳过（不存在）：{a}')
    if not files:
        print(__doc__)
        return 1
    bad = 0
    for f in files:
        tables, problems = check(f)
        flag = '✅' if not problems else '❌'
        print(f'{flag} {f.name[:52]:54s} 表格={tables:3d} 异常={len(problems)}')
        for t, ln, expect, got, text in problems:
            bad += 1
            print(f'     第 {t} 张表 · 第 {ln} 行：期望 {expect} 格，实际 {got} 格 → {text}')
    verdict = '全部通过' if not bad else f'{bad} 处异常'
    print(f'\n合计：{len(files)} 个文件，{verdict}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
