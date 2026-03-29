"""
将 icons/ 目录下所有 SVG 构建为：
  1. icons/sprite.svg  — 标准 SVG Sprite（保留，供服务器环境使用）
  2. icons-sprite.js   — 内联注入版，兼容 file:// 协议
"""
import os, re, glob

ICONS_DIR = "/Users/bing/Desktop/工作区/minicare/ui-draft/icons"
SPRITE_SVG = "/Users/bing/Desktop/工作区/minicare/ui-draft/icons/sprite.svg"
SPRITE_JS  = "/Users/bing/Desktop/工作区/minicare/ui-draft/icons-sprite.js"

def extract_inner(svg_content):
    svg_content = re.sub(r'<!--.*?-->', '', svg_content, flags=re.DOTALL)
    m = re.search(r'<svg[^>]*>(.*?)</svg>', svg_content, re.DOTALL)
    return m.group(1).strip() if m else ''

symbols = []
icon_names = []

for svg_file in sorted(glob.glob(os.path.join(ICONS_DIR, "*.svg"))):
    name = os.path.splitext(os.path.basename(svg_file))[0]
    if name == 'sprite':
        continue
    icon_names.append(name)
    content = open(svg_file, encoding='utf-8').read()
    inner = extract_inner(content)
    # 单行化 inner（去多余换行/空格）
    inner_compact = re.sub(r'\s+', ' ', inner).strip()
    symbol = f'  <symbol id="icon-{name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{inner_compact}</symbol>'
    symbols.append(symbol)

# ── 1. sprite.svg ──
sprite = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n'
sprite += '\n'.join(symbols)
sprite += '\n</svg>\n'
with open(SPRITE_SVG, 'w', encoding='utf-8') as f:
    f.write(sprite)
print(f"sprite.svg — {len(symbols)} 个图标")

# ── 2. icons-sprite.js（内联注入，兼容 file:// ）──
# 把整个 SVG sprite 字符串嵌入 JS，页面加载时插入 body 第一个子节点
svg_str = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" style=\\"display:none\\">'
for sym in symbols:
    # 转义双引号
    svg_str += sym.replace('"', '\\"')
svg_str += '</svg>'

js = f"""/* Lucide Icons Sprite — auto-generated, do not edit */
(function(){{
  var svg = '{svg_str}';
  var div = document.createElement('div');
  div.innerHTML = svg;
  document.body.insertBefore(div.firstChild, document.body.firstChild);
}})();
"""
with open(SPRITE_JS, 'w', encoding='utf-8') as f:
    f.write(js)
print(f"icons-sprite.js — 内联注入版生成完成")
print(f"图标总数: {len(icon_names)}")
