import re, glob, sys

emoji_re = re.compile(
    r'[\U0001F300-\U0001F9FF'
    r'\U00002600-\U000027BF'
    r'\U0001F000-\U0001FFFF'
    r'\U00002702-\U000027B0'
    r'\U00002194-\U00002199'
    r'\U000023E9-\U000023F3'
    r'\U000023F8-\U000023FA'
    r'\U0000231A-\U0000231B'
    r']+',
    re.UNICODE
)

results = {}
for f in sorted(glob.glob('*.html') + glob.glob('*.css')):
    text = open(f, encoding='utf-8').read()
    for m in emoji_re.finditer(text):
        e = m.group().strip()
        if e:
            results.setdefault(e, set()).add(f)

lines = []
for e, files in sorted(results.items()):
    lines.append(f"{e}  ->  {' | '.join(sorted(files))}")

output = '\n'.join(lines)
sys.stdout.write(output + '\n')
sys.stdout.flush()
