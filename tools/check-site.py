"""Check a real Jekyll build: python tools/check-site.py _site [--baseurl /preview]."""
import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.headings = 0
        self.player_urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'data-player-shell' in attrs:
            self.player_urls.append(attrs.get('data-swf', ''))
        if tag == 'h1':
            self.headings += 1
        for key in ('href', 'src', 'data-swf', 'data-search-url'):
            if attrs.get(key):
                self.urls.append(attrs[key])


parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
parser.add_argument('--baseurl', default='')
args = parser.parse_args()
root = args.destination.resolve()
errors = []
pages = list(root.rglob('*.html'))
site_bytes = sum(path.stat().st_size for path in root.rglob('*') if path.is_file())
assert site_bytes < 1_000_000_000, 'Published site exceeds 1 GB; move large game assets to R2 before deploying.'
assert pages, f'No HTML files found in {root}; run Jekyll first.'
checked = 0
for path in pages:
    document = Page()
    html = path.read_text(encoding='utf-8')
    document.feed(html)
    if 'data-search-url=' not in html:
        continue
    checked += 1
    if any(not url.strip() for url in document.player_urls):
        errors.append(f'{path.relative_to(root)}: missing SWF URL; check game.swf, game.swf_key and storage.public_base_url')
    if '<title>' not in html or 'name="viewport"' not in html:
        errors.append(f'{path.relative_to(root)}: missing page metadata')
    for url in document.urls:
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or not parts.path:
            continue
        raw = unquote(parts.path)
        if raw.startswith('/'):
            if args.baseurl and not raw.startswith(args.baseurl + '/'):
                errors.append(f'{path.relative_to(root)}: missing baseurl in {url}')
                continue
            raw = raw[len(args.baseurl):]
            target = root / raw.lstrip('/')
        else:
            target = path.parent / raw
        if not target.exists():
            errors.append(f'{path.relative_to(root)}: broken local link {url}')

index = json.loads((root / 'search.json').read_text(encoding='utf-8'))
assert index, 'Search index is empty.'
assert len({entry['url'] for entry in index}) == len(index), 'Duplicate search URLs.'
for entry in index:
    assert entry['title'] and entry['type'] in ('文章', '游戏'), entry
    route = unquote(urlsplit(entry['url']).path)
    if args.baseurl:
        assert route.startswith(args.baseurl + '/'), entry['url']
        route = route[len(args.baseurl):]
    assert (root / route.lstrip('/')).exists(), entry['url']

if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {checked} modern pages, {len(index)} search entries, all internal links/assets resolve (baseurl={args.baseurl or "/"}).')
