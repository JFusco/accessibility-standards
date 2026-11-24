"""Compare official accessibility documents with the last reviewed observation."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html.parser import HTMLParser
from http.client import HTTPException
import json
from pathlib import Path
import re
from urllib.parse import urldefrag, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
HOSTS = {'www.w3.org', 'html.spec.whatwg.org'}
LIMIT = 16 * 1024 * 1024
TITLE_CODE = re.compile(r'</?code\s*>', re.IGNORECASE)

def official(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc not in HOSTS:
        raise ValueError('Outside the registered official hosts')
    return url

class Redirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, official(newurl))

class DocumentText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0
        self.anchors = set()
        self.in_title = False
    def handle_starttag(self, tag, attrs):
        if tag == 'title':
            self.in_title = True
        if tag in ('script', 'style', 'template'):
            self.hidden += 1
        for key, value in attrs:
            if key == 'id' or (tag == 'a' and key == 'name'):
                self.anchors.add(value)
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if tag in ('script', 'style', 'template') and self.hidden:
            self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden:
            # Python 3.14 preserves the APG's literal inline code tags in title text.
            if self.in_title:
                data = TITLE_CODE.sub(' ', data)
            self.parts.extend(data.split())

def inventory(mode):
    sources = json.loads((ROOT / 'src/sources.yml').read_text())['authorities']
    authorities = {entry['id']: official(entry['url']) for entry in sources}
    docs = {url: {} for url in authorities.values()}
    for folder in ('patterns', 'semantics', 'foundations', 'policies'):
        for path in sorted((ROOT / 'src' / folder).rglob('*.yml')):
            value = json.loads(path.read_text())
            for record in value if isinstance(value, list) else [value]:
                for ref in record.get('standards_refs', []):
                    docs[authorities[ref['authority']]].setdefault('', set()).add(record['id'])
                    if mode == 'full':
                        url, fragment = urldefrag(ref['url'])
                        docs.setdefault(official(url), {}).setdefault(fragment, set()).add(record['id'])
    if mode == 'full':
        coverage = json.loads((ROOT / 'src/coverage/aria-apg.yml').read_text())
        for table in ('patterns', 'practices'):
            ids = docs.setdefault(official(coverage[f'{table}_url']), {}).setdefault('', set())
            ids.update(record_id for row in coverage[table] for record_id in row['record_ids'])
    return docs

def observe(item):
    url, anchors = item
    result = {'url': url, 'locators': {key: sorted(ids) for key, ids in sorted(anchors.items())}}
    try:
        req = Request(official(url), headers={'User-Agent': 'AccessibilityStandards/1.0 (+https://github.com/JFusco/accessibility-standards)'})
        with build_opener(Redirect()).open(req, timeout=20) as response:
            if response.headers.get_content_type() not in ('text/html','application/xhtml+xml'):
                raise ValueError('Expected HTML')
            expected_length = response.length
            content = response.read(LIMIT + 1)
            if len(content) > LIMIT:
                raise ValueError('Document exceeds scan limit')
            if expected_length is not None and len(content) < expected_length:
                raise ValueError(f'Incomplete document: expected {expected_length} bytes, received {len(content)}')
            parser = DocumentText()
            parser.feed(content.decode(response.headers.get_content_charset() or 'utf-8'))
        if not parser.parts:
            raise ValueError('Empty document')
        result['sha256'] = hashlib.sha256(' '.join(parser.parts).encode()).hexdigest()
        result['missing_anchors'] = sorted(key for key in anchors if key and key not in parser.anchors)
    except (OSError, HTTPException, LookupError, ValueError) as error:
        result['error'] = str(error)
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['index','full'], required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    baseline = json.loads((ROOT/'sources/reviewed.json').read_text())
    docs = inventory(args.mode)
    with ThreadPoolExecutor(max_workers=4) as pool:
        observed = list(pool.map(observe, sorted(docs.items())))
    for row in observed:
        old = baseline.get(row['url'])
        row['baseline'] = old
        row['status'] = ('unavailable' if 'error' in row else 'missing-locator' if row['missing_anchors']
                         else 'unreviewed' if not old else 'changed' if old != row['sha256'] else 'current')
    args.output.write_text(json.dumps({'mode': args.mode, 'documents': observed}, indent=2)+'\n')
    print(f"{len(observed)} official documents checked; {sum(row['status'] != 'current' for row in observed)} need attention")

if __name__ == '__main__':
    main()
