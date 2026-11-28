import test from "node:test";
import assert from "node:assert/strict";
import { planNativeProviderTeamIdentityBackfill as plan } from "./plan-native-provider-team-identity-backfill.js";
function input() {
  return { discovery: { ok: true, dayKey: "2026-11-28", hash: "source-hash",
    generatedAt: "2026-11-28T19:53Z", fixtureIdentitySchema: "ai-matchlab.provider-fixture-identity.v1",
    fixtures: [{ provider: "flashscore", providerFixtureId: "FS1", canonicalSlug: "eng.1",
      providerCompetitionId: "E", dayKey: "2026-11-28", kickoffUtc: "2026-11-28T15:00Z",
      eligibility: "eligible", home: { name: "Home", providerTeamId: "H" },
      away: { name: "Away", providerTeamId: "A" } }] },
    canonicalFixtures: [{ canonicalId: "CID1", source: "flashscore", sourceId: "FS1",
      providerIds: { flashscore: "FS1" }, leagueSlug: "eng.1", dayKey: "2026-11-28",
      kickoffUtc: "2026-11-28T15:00Z", homeTeam: "Home", awayTeam: "Away",
      status: "FT", scoreHome: 2, scoreAway: 1, arbitraryEvidence: { retained: true } }] };
}
test("exact fixture evidence adds native IDs without changing canonical truth or input", () => {
  const value = input(), before = structuredClone(value);
  const result = plan(value);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(value, before);
  const { providerTeamIds, providerTeamIdentityEvidence, ...truth } = result.fixtures[0];
  assert.deepEqual(truth, before.canonicalFixtures[0]);
  assert.deepEqual(providerTeamIds, { flashscore: { home: "H", away: "A" } });
  assert.equal(providerTeamIdentityEvidence.flashscore.discoveryHash, "source-hash");
});
test("names and kickoff alone never authorize a cross-provider binding", () => {
  const value = input(); value.canonicalFixtures[0].source = "espn";
  value.canonicalFixtures[0].sourceId = "123"; value.canonicalFixtures[0].providerIds = { espn: "123" };
  assert.equal(plan(value).changes.length, 0);
});
test("an existing explicit Flashscore binding may retain an ESPN native pair", () => {
  const value = input(); value.canonicalFixtures[0].source = "espn";
  value.canonicalFixtures[0].sourceId = "123";
  value.canonicalFixtures[0].providerIds.espn = "123";
  value.canonicalFixtures[0].providerTeamIds = { espn: { home: "101", away: "202" } };
  const result = plan(value);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(result.fixtures[0].providerTeamIds, {
    espn: { home: "101", away: "202" }, flashscore: { home: "H", away: "A" }
  });
});
test("wrong sides, day, league, kickoff, duplicates and quarantine cannot be backfilled", () => {
  for (const mutate of [
    v => { v.canonicalFixtures[0].homeTeam = "Away"; },
    v => { v.canonicalFixtures[0].dayKey = "2026-11-29"; },
    v => { v.canonicalFixtures[0].leagueSlug = "esp.1"; },
    v => { v.canonicalFixtures[0].kickoffUtc = "2026-11-28T16:00Z"; },
    v => { v.discovery.fixtures.push({ ...v.discovery.fixtures[0] }); },
    v => { v.canonicalFixtures.push({ ...v.canonicalFixtures[0], canonicalId: "CID2" }); },
    v => { v.canonicalFixtures[0].providerTeamIdentityConflict = true; },
    v => { v.canonicalFixtures[0].sourceMatchId = "CONTRADICTION"; }
  ]) {
    const value = input(); mutate(value); assert.equal(plan(value).changes.length, 0);
  }
});
test("existing native identity is never replaced", () => {
  const value = input(); value.canonicalFixtures[0].providerTeamIds = { flashscore: { home: "OLD", away: "A" } };
  assert.deepEqual(plan(value).fixtures, value.canonicalFixtures);
});
