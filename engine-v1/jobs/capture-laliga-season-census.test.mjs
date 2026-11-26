import test from 'node:test';
import assert from 'node:assert/strict';
import { captureLaLigaSeason } from './capture-laliga-season-census.mjs';

const day = '2026-08-16T00:00:00Z';
const page = season => new Response(`<script id="__NEXT_DATA__">${JSON.stringify({
  props: { pageProps: {
    statusCode: 200, season, competition: 'primera-division', gameweek: { id: 9 },
    gameweekList: [{ id: 9, week: 1, date: day }],
    matches: [{ id: 99, date: day, status: 'PostMatch',
      home_team: { id: 1, nickname: 'Home' }, away_team: { id: 2, nickname: 'Away' } }],
  } },
})}</script>`);
const asOf = new Date(day);

test('binds a result page to the requested edition and records evidence', async () => {
  const result = await captureLaLigaSeason('esp.1', 2026, { asOf, fetchPage: async () => page('2026') });
  assert.equal(result.matches[0].officialId, '99');
  assert.match(result.pages[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.fullCoverageCertified, false);
});

test('rejects an official page for a different season', async () => {
  await assert.rejects(captureLaLigaSeason('esp.1', 2026, { asOf, fetchPage: async () => page('2025') }),
    /LALIGA_EDITION_MISMATCH/);
});
