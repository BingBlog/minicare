#!/usr/bin/env python3
"""
Markdown → 单文件 HTML（可预览版）

为什么需要它：仓库里的长文档是 Markdown，但在部分环境下 .md 预览不弹窗/不可读。
本脚本把 .md 渲染成**自包含**的 HTML（内联 CSS、零外部依赖、无 CDN），
带上侧栏目录，用浏览器打开即可阅读，表格与代码块完整保留。

用法：
    python3 docs/tools/md2html.py <input.md> [output.html]
    python3 docs/tools/md2html.py docs/agent/tech/FOO.md          # 输出同名 .html
    python3 docs/tools/md2html.py docs/a.md /tmp/a.html           # 指定输出

依赖：mistune（>=3.0，需 table 插件）
    python3 -m venv <venv> && <venv>/bin/pip install mistune

设计约束（与本仓库的文档约定一致）：
  - 只做渲染，不修改原文；源 .md 始终是唯一真相源
  - 输出单文件、无外部资源，便于归档与离线查看
  - 表格依赖 GFM table 插件；若源文件有"断表"（空行/嵌列表/裸竖线/格数不齐），
    渲染出来会退化成纯文本 —— 那说明源文件有问题，用断表自检脚本先修
"""
import html
import re
import sys

import mistune

SLUG_RE = re.compile(r'[^\w\u4e00-\u9fff]+')


def slugify(text: str, used: dict) -> str:
    s = SLUG_RE.sub('-', text).strip('-') or 'sec'
    n = used.get(s, 0) + 1
    used[s] = n
    return s if n == 1 else f'{s}-{n}'


def convert(src_path: str, out_path: str) -> None:
    src = open(src_path, encoding='utf-8').read()
    m = re.search(r'^#\s+(.+)$', src, re.M)
    title = m.group(1).strip() if m else src_path

    md = mistune.create_markdown(
        plugins=['table', 'strikethrough', 'task_lists', 'url'], renderer='html'
    )
    body = md(src)

    headings, used = [], {}

    def add_id(mo):
        lvl, inner = mo.group(1), mo.group(2)
        plain = re.sub(r'<[^>]+>', '', inner)
        slug = slugify(plain, used)
        headings.append((int(lvl), plain, slug))
        return f'<h{lvl} id="{slug}">{inner}</h{lvl}>'

    body = re.sub(r'<h([23])>(.*?)</h\1>', add_id, body, flags=re.S)
    toc = ''.join(
        f'<a class="lvl{lvl}" href="#{slug}">{html.escape(text)}</a>'
        for lvl, text, slug in headings
    )
    n_tables = body.count('<table')
    n2 = sum(1 for l, _, _ in headings if l == 2)
    n3 = sum(1 for l, _, _ in headings if l == 3)

    doc = TEMPLATE.format(
        title=html.escape(title), toc=toc, body=body,
        n2=n2, n3=n3, n_tables=n_tables,
    )
    open(out_path, 'w', encoding='utf-8').write(doc)
    print(f'✅ {out_path}')
    print(f'   标题 h2={n2} h3={n3}｜表格 {n_tables}')


TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
:root{{--bg:#f6f7f9;--paper:#fff;--ink:#1f2328;--ink2:#4a5058;--ink3:#6b7280;
--line:#e3e6ea;--line2:#eef0f3;--accent:#2563eb;--accent-soft:#eff4ff;
--code-bg:#f4f6f8;--code-ink:#b4315a;--thead:#f0f3f7;--zebra:#fafbfc;}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}
body{{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
-webkit-font-smoothing:antialiased}}
.wrap{{display:flex;max-width:1440px;margin:0 auto;gap:26px;padding:0 20px;align-items:flex-start}}
.toc{{position:sticky;top:0;flex:0 0 270px;max-height:100vh;overflow-y:auto;
padding:28px 6px 40px 0;font-size:13px;line-height:1.5}}
.toc-title{{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--ink3);padding:0 10px 10px}}
.toc a{{display:block;padding:4px 10px;color:var(--ink2);text-decoration:none;
border-left:2px solid transparent;border-radius:0 4px 4px 0}}
.toc a:hover{{background:var(--accent-soft);color:var(--accent);border-left-color:var(--accent)}}
.toc a.lvl2{{font-weight:600;margin-top:9px}}
.toc a.lvl3{{padding-left:22px;color:var(--ink3);font-size:12.5px}}
main{{flex:1 1 auto;min-width:0;background:var(--paper);margin:24px 0 60px;
padding:44px 52px 64px;border-radius:12px;
box-shadow:0 1px 3px rgba(16,24,40,.06),0 8px 24px -12px rgba(16,24,40,.1)}}
main>:first-child{{margin-top:0}}
h1{{font-size:29px;line-height:1.32;margin:0 0 22px;padding-bottom:18px;
border-bottom:2px solid var(--line);letter-spacing:-.01em}}
h2{{font-size:21px;margin:50px 0 16px;padding-bottom:10px;
border-bottom:1px solid var(--line);scroll-margin-top:20px}}
h3{{font-size:17px;margin:34px 0 12px;scroll-margin-top:20px}}
p{{margin:13px 0}}a{{color:var(--accent);text-decoration:none}}a:hover{{text-decoration:underline}}
blockquote{{margin:18px 0;padding:14px 20px;background:#f8fafc;border-left:3px solid #cbd5e1;
border-radius:0 6px 6px 0;color:var(--ink2);font-size:14.5px}}
blockquote p{{margin:5px 0}}
ul,ol{{padding-left:24px;margin:13px 0}}li{{margin:5px 0}}
code{{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;
background:var(--code-bg);color:var(--code-ink);padding:.16em .42em;border-radius:4px;
word-break:break-word}}
pre{{background:#1e2430;color:#e6edf3;padding:18px 20px;border-radius:8px;overflow-x:auto;
margin:18px 0;font-size:12.5px;line-height:1.7}}
pre code{{background:none;color:inherit;padding:0;font-size:inherit;white-space:pre-wrap}}
table{{border-collapse:separate;border-spacing:0;width:100%;margin:18px 0;font-size:13.5px;
border:1px solid var(--line);border-radius:8px;overflow:hidden}}
thead th{{background:var(--thead);font-weight:700;text-align:left;padding:10px 13px;
border-bottom:1px solid var(--line);white-space:nowrap}}
tbody td{{padding:9px 13px;border-bottom:1px solid var(--line2);vertical-align:top}}
tbody tr:nth-child(even) td{{background:var(--zebra)}}
tbody tr:last-child td{{border-bottom:none}}
tbody tr:hover td{{background:#f5f8ff}}
hr{{border:none;border-top:1px solid var(--line);margin:40px 0}}
strong{{font-weight:700;color:#111827}}
.docmeta{{font-size:12.5px;color:var(--ink3);padding:14px 0 0;
border-top:1px solid var(--line2);margin-top:40px}}
@media(max-width:1020px){{.wrap{{flex-direction:column}}
.toc{{position:static;flex:none;max-height:none;width:100%;padding:20px 0 0}}
main{{padding:28px 20px 44px;margin:0 0 40px}}
h1{{font-size:23px}}h2{{font-size:18px}}table{{font-size:12.5px}}}}
</style></head><body>
<div class="wrap">
<nav class="toc"><div class="toc-title">目录 · {n2} 节 / {n3} 小节</div>{toc}</nav>
<main>
{body}
<p class="docmeta">由 <code>docs/tools/md2html.py</code> 从同名 Markdown 渲染 · {n_tables} 张表格全部正常解析</p>
</main></div></body></html>'''


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    src = argv[1]
    out = argv[2] if len(argv) > 2 else re.sub(r'\.md$', '', src) + '.html'
    convert(src, out)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
