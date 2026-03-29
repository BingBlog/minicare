import re, glob

emoji_re = re.compile(r'[\U0001F300-\U0001F9FF\U00002600-\U000027BF\U0000FE00-\U0000FE0F\U0001F000-\U0001FFFF\U00002702-\U000027B0\U00002194-\U00002199\U00002934-\U00002935\U000025AA-\U000025FE\U00002B05-\U00002B07\U00002B1B-\U00002B1C\U00002B50\U00002B55\U0000231A\U0000231B\U000023E9-\U000023F3\U000023F8-\U000023FA]+', re.UNICODE)

results = {}
for f in sorted(glob.glob('*.html') + glob.glob('*.css')):
    text = open(f, encoding='utf-8').read()
    for m in emoji_re.finditer(text):
        e = m.group().strip()
        if e and len(e) > 0:
            results.setdefault(e, set()).add(f)

for e, files in sorted(results.items()):
    print(f"{e}  ->  {' | '.join(sorted(files))}")
