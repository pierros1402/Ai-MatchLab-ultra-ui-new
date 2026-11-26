import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCanonicalCensus } from './audit-laliga-canonical.mjs';

const kickoffUtc = '2026-08-15T22:30:00Z';
const match = { officialId: '11', kickoffUtc, home: { name: 'Home' }, away: { name: 'Away' } };
const census = { slug: 'esp.1', matches: [match] };
const fixture = { canonicalId: 'canonical', kickoffUtc, homeTeam: 'Home', awayTeam: 'Away' };
const audit = (bucket, matches = [match]) => auditCanonicalCensus({ ...census, matches }, {
  readBucket: async day => {
    assert.equal(day, '2026-08-16');
    return bucket;
  },
  teamIdentity: () => null,
});

test('binds official IDs and distinguishes inferred links from unavailable buckets', async () => {
  assert.equal((await audit([{ ...fixture, providerIds: { laliga: '11' } }])).rows[0].status, 'OFFICIAL_ID_MATCH');
  assert.equal((await audit([fixture])).rows[0].status, 'KICKOFF_AND_TEAM_MATCH');
  assert.equal((await audit([])).rows[0].status, 'UNMATCHED_CANDIDATE');
  assert.equal((await audit(null)).rows[0].status, 'CANONICAL_BUCKET_UNAVAILABLE');
});

test('holds conflicting and repeated links', async () => {
  assert.equal((await audit([{ ...fixture, providerIds: { laliga: '11' }, awayTeam: 'Other' }])).rows[0].status, 'IDENTITY_HOLD');
  const report = await audit([fixture], [match, { ...match, officialId: '12' }]);
  assert.deepEqual(report.counts, { IDENTITY_HOLD: 2 });
});

test('uses the LaLiga team ID for reviewed spellings and exposes kickoff drift', async () => {
  const racing = { ...match, home: { id: 49, name: 'R. Racing Club' } };
  const canonical = { ...fixture, homeTeam: 'Racing Santander' };
  assert.equal((await audit([canonical], [racing])).rows[0].status, 'KICKOFF_AND_TEAM_MATCH');
  const result = await audit([{ ...canonical, kickoffUtc: '2026-08-15T22:00:00Z' }], [racing]);
  assert.equal(result.rows[0].status, 'KICKOFF_DISAGREEMENT');
  assert.equal(result.rows[0].canonicalCandidates[0].canonicalId, 'canonical');
});

test('matches the two reviewed Real Sociedad reserve spellings without matching the senior side', async () => {
  const { sameSquadMarkers, teamNamesMatch } = await import('../core/team-identity.js');
  assert.equal(teamNamesMatch('Real Sociedad II', 'Real Sociedad B'), true);
  assert.equal(sameSquadMarkers('Real Sociedad II', 'Real Sociedad'), false);
  assert.equal(sameSquadMarkers('Barcelona II', 'Barcelona B'), false);
});
