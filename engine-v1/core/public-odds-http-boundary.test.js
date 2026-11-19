import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('main HTTP endpoints explicitly opt in to fail-closed publication view', () => {
 const main = src('../index.js');
 assert.match(main, /getAssessmentRows\(date, \{ publication: true \}\)/);
 assert.match(main, /getDeployedOddsSnapshot\(matchId, market, date, \{ publication: true \}\)/);
 assert.match(main, /getDeployedOddsDay\(date, \{ publication: true \}\)/);
 assert.match(main, /projectPublicAssessmentBridge\(m, date\)/);
 assert.doesNotMatch(main, /aiAssessment: m\.aiAssessment, reconciled: true/);
});
test('standalone HTTP odds routes explicitly use publication projection', () => {
 const server = src('../odds/odds-server.js');
 assert.match(server, /getDeployedOddsSnapshot\(matchId, market, date, \{ publication: true \}\)/);
 assert.match(server, /getDeployedOddsDay\(String\(req\.query\.date \|\| athensDayKey\(\)\), \{ publication: true \}\)/);
});
test('common storage readers gate both deployed and live public models', () => {
 const store = src('../storage/odds-memory-db.js');
 assert.match(store,/projectPublicOddsRows\(snap\.matches/);
 assert.match(store,/projectPublicOddsRows\(live\.matches/);
 assert.match(store,/projectPublicOddsRow\(full/);
 assert.match(store,/projectPublicOddsRow\(d, fixtures/);
});
