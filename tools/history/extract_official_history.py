"""Extract research facts from captured official pages; never promote history."""
import argparse
import hashlib
import json
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

MONTHS = {name: i + 1 for i, name in enumerate(
    'january february march april may june july august september october november december'.split())}
MONTHS.update(dict(zip('janvier février mars avril mai juin juillet août septembre octobre novembre décembre'.split(), range(1, 13))))
DATE = re.compile(r'\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+(\d{1,2})\s+([A-Za-zéû]+)(?:\s+(20\d{2}))?\b', re.I)


class PageEvents(HTMLParser):
    def __init__(self, uefa):
        super().__init__(convert_charrefs=True)
        self.uefa, self.in_article = uefa, False
        self.events, self.anchor, self.blocks, self.ignored = [], None, [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.ignored += 1
        if tag == 'article':
            self.in_article = True
        if self.ignored or (self.uefa and not self.in_article):
            return
        if tag in ('h1', 'h2', 'h3', 'h4', 'li'):
            self.blocks.append([tag, []])
        if tag == 'a':
            self.anchor = [dict(attrs).get('href', ''), []]

    def handle_data(self, data):
        if self.ignored or (self.uefa and not self.in_article):
            return
        for block in self.blocks:
            block[1].append(data)
        if self.anchor is not None:
            self.anchor[1].append(data)
        else:
            self.events.append(('text', data))

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.ignored = max(0, self.ignored - 1)
        if self.ignored or (self.uefa and not self.in_article):
            return
        if tag == 'a' and self.anchor is not None:
            self.events.append(('link', self.anchor[0], ''.join(self.anchor[1])))
            self.anchor = None
        if self.blocks and self.blocks[-1][0] == tag:
            block = self.blocks.pop()
            self.events.append(('heading' if tag.startswith('h') else 'item', ''.join(block[1])))
        if tag == 'article':
            self.in_article = False


def clean(text):
    return re.sub(r'\s+', ' ', re.sub('[\ufeff\u200b]', '', text)).strip()


def parse_page(html, source):
    slug, edition = source['slug'], source['edition']
    if slug not in ('uefa.nations', 'fra.coupe_de_france'):
        raise ValueError('COMPETITION_OUTSIDE_IMPLEMENTED_OFFICIAL_SCOPE')
    parser = PageEvents(slug == 'uefa.nations')
    parser.feed(html)
    current_day, default_year, rows, holds, seen = None, int(edition[:4]), [], [], {}
    for event in parser.events:
        kind, text = event[0], clean(event[-1])
        if kind == 'heading':
            current_day = None
            if 'League phase' in text:
                default_year = int(edition[:4])
        if kind == 'text':
            match = DATE.search(text)
            if match:
                day, month, year = match.groups()
                if month.lower() in MONTHS:
                    current_day = date(int(year or default_year), MONTHS[month.lower()], int(day)).isoformat()
            continue
        if slug == 'uefa.nations' and kind == 'link':
            native = re.fullmatch(r'https://www\.uefa\.com/uefanationsleague/match/(\d+)--[^?#/]+/?', event[1])
            if not native:
                continue
            score = re.fullmatch(r'(.+?)\s+(\d+)[-–](\d+)\s+(.+?)(?:\s+\((.+)\))?', text)
            if not score:
                # A fixture with no result cannot become a played final.
                continue
            home, sh, sa, away, suffix = score.groups()
            row = {'officialMatchId': native[1], 'matchUrl': event[1], 'homeTeam': home,
                   'awayTeam': away, 'scoreHome': int(sh), 'scoreAway': int(sa), 'scoreNote': suffix}
            key = native[1]
        elif slug == 'fra.coupe_de_france' and kind == 'item':
            match = re.fullmatch(r'(.+?)\s+[-–]\s+(.+?)\s+(\d+)[-–](\d+)(?:,\s*(\d+)\s+tab\s+(\d+))?', text)
            if not match:
                continue
            home, away, sh, sa, ph, pa = match.groups()
            row = {'homeTeam': re.sub(r'\s*\((?:L\d|N\d?|R\d|D\d)\)$', '', home),
                   'awayTeam': re.sub(r'\s*\((?:L\d|N\d?|R\d|D\d)\)$', '', away),
                   'scoreHome': int(sh), 'scoreAway': int(sa),
                   'penaltiesHome': int(ph) if ph else None, 'penaltiesAway': int(pa) if pa else None}
            key = json.dumps([current_day, home, away], ensure_ascii=False)
        else:
            continue
        if key in seen:
            prior = seen[key]
            conflict = any(prior.get(field) != row.get(field) for field in ('homeTeam', 'awayTeam', 'scoreHome', 'scoreAway'))
            reason = 'CONFLICTING_OFFICIAL_OBSERVATION' if conflict else 'DUPLICATE_OFFICIAL_OBSERVATION'
            holds.append({'reason': reason, 'reference': key, 'incomingText': text})
            if conflict:
                prior['reviewReasons'].append(reason)
            continue
        row.update(leagueSlug=slug, officialEdition=edition, officialDate=current_day,
                   sourceUrl=source['url'], responseSha256=source['sha256'],
                   exactKickoffUtc=None, authorityPromotionAllowed=False)
        reasons = []
        if not current_day:
            reasons.append('EXACT_MATCH_DATE_NOT_OBSERVED')
        if row.get('scoreNote'):
            reasons.append('SCORE_PERIOD_REQUIRES_MATCH_PAGE_REVIEW')
        if slug == 'fra.coupe_de_france':
            reasons.append('OFFICIAL_RESULTS_SUBJECT_TO_HOMOLOGATION_REVIEW')
        row['reviewReasons'] = reasons
        seen[key] = row
        rows.append(row)
    return {'rows': rows, 'holds': holds, 'templateRecognized': bool(rows),
            'fullCompetitionBaselineCertified': False}


def extract_capture(directory):
    directory = Path(directory).resolve()
    report = json.loads((directory / 'report.json').read_text(encoding='utf-8-sig'))
    if report.get('schema') != 'ai-matchlab.history-environment-probe.v1':
        raise ValueError('OFFICIAL_CAPTURE_REPORT_SCHEMA_REQUIRED')
    sources = []
    for source in report['sources']:
        if not source.get('ok'):
            sources.append({'slug': source['slug'], 'status': 'ACQUISITION_FAILED'})
            continue
        digest = source['sha256']
        if not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('INVALID_CAPTURE_DIGEST')
        # Read only the content-addressed file in this exact capture directory.
        file = directory / (digest + '.html')
        if file.is_symlink():
            raise ValueError('CAPTURE_SYMLINK_NOT_ALLOWED')
        content = file.read_bytes()
        if hashlib.sha256(content).hexdigest() != digest or len(content) != source['bytes']:
            raise ValueError('OFFICIAL_CAPTURE_HASH_OR_SIZE_MISMATCH')
        expected_host = 'https://www.uefa.com/' if source['slug'] == 'uefa.nations' else 'https://www.fff.fr/'
        if not source['url'].startswith(expected_host):
            raise ValueError('UNEXPECTED_OFFICIAL_SOURCE_ORIGIN')
        html = content.decode('utf-8')
        if source['slug'] == 'uefa.nations':
            title = re.search(r'<title[^>]*>(.*?)</title>', html, re.S | re.I)
            if not title or f"{source['edition'][:4]}/{source['edition'][-2:]}" not in title.group(1):
                raise ValueError('OFFICIAL_TITLE_EDITION_MISMATCH')
        parsed = parse_page(html, source)
        sources.append({'slug': source['slug'], 'edition': source['edition'], 'url': source['url'],
                        'sha256': digest, 'hashVerified': True, **parsed})
    return {'schema': 'ai-matchlab.official-history-extraction.v1', 'sources': sources,
            'productionWrites': 0, 'authorityPromotionAllowed': False, 'fullCoverageCertified': False}


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('capture_directory')
    cli.add_argument('output')
    args = cli.parse_args()
    result = extract_capture(args.capture_directory)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'sources': [{'slug': s['slug'], 'edition': s.get('edition'),
                                 'results': len(s.get('rows', [])), 'holds': len(s.get('holds', []))}
                                for s in result['sources']], 'productionWrites': 0}))
