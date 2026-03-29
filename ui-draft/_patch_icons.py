"""
批量修改所有 HTML：
1. 将 href="icons/sprite.svg#icon-xxx" → href="#icon-xxx"
2. 在 </body> 前插入 <script src="icons-sprite.js"></script>
"""
import os, re, glob

HTML_DIR = "/Users/bing/Desktop/工作区/minicare/ui-draft"

patched = 0
for html_file in sorted(glob.glob(os.path.join(HTML_DIR, "*.html"))):
    # 跳过临时脚本生成的文件
    name = os.path.basename(html_file)
    content = open(html_file, encoding='utf-8').read()
    original = content

    # 1. 替换 href="icons/sprite.svg#icon-xxx" → href="#icon-xxx"
    content = re.sub(r'href="icons/sprite\.svg#(icon-[^"]+)"', r'href="#\1"', content)

    # 2. 如果已有 icons-sprite.js 引用则跳过，否则在 </body> 前插入
    if 'icons-sprite.js' not in content:
        content = content.replace('</body>', '    <script src="icons-sprite.js"></script>\n  </body>')

    if content != original:
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(content)
        patched += 1
        print(f"  ✓ patched: {name}")
    else:
        print(f"  - skipped: {name}")

print(f"\n完成，修改了 {patched} 个文件")
