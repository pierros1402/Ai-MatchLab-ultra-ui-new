import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from extract_official_history import parse_page, extract_capture

SOURCE = {'slug': 'uefa.nations', 'edition': '2026-2027', 'url': 'https://www.uefa.com/news/', 'sha256': 'a' * 64}
LINK = '<a href="https://www.uefa.com/uefanationsleague/match/12345--home-vs-away/">{}</a>'


class OfficialCaptureTests(unittest.TestCase):
    def test_scheduled_fixtures_and_script_scores_never_become_results(self):
        result = parse_page('<script>' + LINK.format('Fake 9-0 Other') + '</script><article><p>Thursday 24 September</p>' + LINK.format('Home vs Away') + LINK.format('Home 2-0 Away') + '</article>', SOURCE)
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['officialDate'], '2026-09-24')
        self.assertIsNone(result['rows'][0]['exactKickoffUtc'])
        self.assertFalse(result['rows'][0]['authorityPromotionAllowed'])

    def test_heading_clears_previous_date_instead_of_guessing_a_final_date(self):
        html = '<article><p>Thursday 24 September</p><h3>Final</h3>' + LINK.format('Home 2-2 Away (aet, 5-3 pens)') + '</article>'
        row = parse_page(html, SOURCE)['rows'][0]
        self.assertIsNone(row['officialDate'])
        self.assertIn('SCORE_PERIOD_REQUIRES_MATCH_PAGE_REVIEW', row['reviewReasons'])

    def test_playoff_explicit_year_and_league_phase_year_are_separate(self):
        source = {**SOURCE, 'edition': '2024-2025'}
        html = '<article><p>Thursday 26 March 2026</p>' + LINK.format('Home 1-0 Away') + '<h2>League phase results</h2><p>Thursday 5 September</p>' + LINK.replace('12345', '12346').format('Other 0-0 Team') + '</article>'
        self.assertEqual([r['officialDate'] for r in parse_page(html, source)['rows']], ['2026-03-26', '2024-09-05'])

    def test_conflicting_duplicate_is_visible_and_blocks_unqualified_use(self):
        result = parse_page('<article><p>Thursday 24 September</p>' + LINK.format('Home 1-0 Away') + LINK.format('Home 2-0 Away') + '</article>', SOURCE)
        self.assertEqual(result['holds'][0]['reason'], 'CONFLICTING_OFFICIAL_OBSERVATION')
        self.assertIn('CONFLICTING_OFFICIAL_OBSERVATION', result['rows'][0]['reviewReasons'])

    def test_french_entities_levels_and_penalties_remain_separate(self):
        source = {**SOURCE, 'slug': 'fra.coupe_de_france', 'edition': '2025-2026'}
        row = parse_page('<p><b>Dimanche 16 novembre 2025</b></p><ul><li><strong>AS Vitr&eacute; (N3)</strong> &ndash; AG Plouvorn (R1) 1-1, 3 tab 4</li></ul>', source)['rows'][0]
        self.assertEqual(row['homeTeam'], 'AS Vitré')
        self.assertEqual((row['scoreHome'], row['scoreAway']), (1, 1))
        self.assertEqual((row['penaltiesHome'], row['penaltiesAway']), (3, 4))
        self.assertIn('OFFICIAL_RESULTS_SUBJECT_TO_HOMOLOGATION_REVIEW', row['reviewReasons'])

    def test_off_map_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'OUTSIDE'):
            parse_page('', {**SOURCE, 'slug': 'unmapped.lower_league'})

    def test_invisible_footer_character_cannot_turn_aggregate_score_into_team_name(self):
        row = parse_page('<article><p>Sunday 23 March 2025</p>' + LINK.format('Home 2-1 Bulgaria (agg: 4-2)\ufeff') + '</article>', SOURCE)['rows'][0]
        self.assertEqual(row['awayTeam'], 'Bulgaria')
        self.assertEqual(row['scoreNote'], 'agg: 4-2')

    def test_capture_tampering_and_wrong_edition_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix='aiml-official-test-') as directory:
            body = b'<title>2026/27 UEFA Nations League</title><article></article>'
            digest = hashlib.sha256(body).hexdigest()
            source = {**SOURCE, 'sha256': digest, 'bytes': len(body), 'ok': True}
            report = {'schema': 'ai-matchlab.history-environment-probe.v1', 'sources': [source]}
            root = Path(directory)
            (root / 'report.json').write_text(json.dumps(report), encoding='utf-8')
            (root / (digest + '.html')).write_bytes(body + b'tampered')
            with self.assertRaisesRegex(ValueError, 'HASH_OR_SIZE'):
                extract_capture(directory)
            (root / (digest + '.html')).write_bytes(body)
            source['edition'] = '2024-2025'
            (root / 'report.json').write_text(json.dumps(report), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'EDITION_MISMATCH'):
                extract_capture(directory)


if __name__ == '__main__':
    unittest.main()
