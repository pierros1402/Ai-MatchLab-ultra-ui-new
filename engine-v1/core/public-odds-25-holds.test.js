import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectPublicOddsRow } from './public-odds-assessment-projection.js';
const cases = JSON.parse(fs.readFileSync(new URL('./public-odds-25-holds-fixtures.json', import.meta.url), 'utf8'));
test('all 25 preexisting immutable identity HOLD cases remain unpublishable', () => {
  assert.equal(cases.length, 25);
  for (const c of cases) {
    const row = { ...c.source, market: { current: {home:2.1}}, oddsBook: 'book', aiAssessment: {markets: {'1X2': {probs: {home:0.5}}}}};
    const projected = projectPublicOddsRow(row, [c.canonical], c.day);
    assert.equal(projected.aiAssessment, null, c.day+' '+c.source.canonicalId);
    assert.deepEqual(projected.market, row.market);
    assert.equal(projected.oddsBook, 'book');
  }
});
