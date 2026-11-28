import test from "node:test";
import assert from "node:assert/strict";
import { planPriorProviderBindingRestoration as plan } from "./plan-prior-provider-binding-restoration.js";
function input() {
  const row = { canonicalId: "cid_eng1_home_away_20261128", source: "espn", sourceId: "123",
    providerIds: { espn: "123" }, leagueSlug: "eng.1", dayKey: "2026-11-28",
    kickoffUtc: "2026-11-28T15:00Z", homeTeam: "Home", awayTeam: "Away", status: "FT", scoreHome: 2, scoreAway: 1 };
  return { canonicalFixtures: [row],
    history: { schema: "ai-matchlab.prior-explicit-provider-fixture-bindings.v1", dayKey: row.dayKey,
      records: [{ providerFixtureId: "fixture1", sourceCommit: "a".repeat(40), sourceBlobSha: "b".repeat(40),
        sourcePath: "data/canonical-fixtures/2026-11-28/eng.1.json",
        row: { ...row, providerIds: { espn: "123", flashscore: "fixture1" } } }] },
    discovery: { fixtureIdentitySchema: "ai-matchlab.provider-fixture-identity.v1", dayKey: row.dayKey,
      hash: "feed", generatedAt: "2026-11-28T20:00Z", fixtures: [{
        provider: "flashscore", providerFixtureId: "fixture1", canonicalSlug: "eng.1",
        dayKey: row.dayKey, eligibility: "eligible", kickoffUtc: row.kickoffUtc,
        home: { name: "Home", providerTeamId: "nativeH1" }, away: { name: "Away", providerTeamId: "nativeA1" }
      }] } };
}
test("committed explicit provider ID restoration preserves all original truth and lineage", () => {
  const value = input(), original = structuredClone(value);
  value.history.records[0].row.providerIdentityLink = { inherited: true };
  const result = plan(value), row = result.fixtures[0];
  assert.equal(result.changes.length, 1);
  assert.equal(row.providerIds.espn, "123");
  assert.equal(row.providerIds.flashscore, "fixture1");
  assert.deepEqual(row.providerIdentityLink, { inherited: true });
  for (const [key, v] of Object.entries(original.canonicalFixtures[0])) {
    if (key !== "providerIds") assert.deepEqual(row[key], v);
  }
});
test("a removed canonical fixture is never recreated from discovery or historical evidence", () => {
  const value = input(); value.canonicalFixtures = [];
  const result = plan(value);
  assert.equal(result.fixtures.length, 0);
  assert.equal(result.changes.length, 0);
  assert.equal(result.rejected[0].reason, "canonical_fixture_absent");
});
test("missing history, wrong primary ID, reversed sides, changed native IDs and duplicate claims fail closed", () => {
  for (const mutate of [
    v => { delete v.history.records[0].row.providerIds.flashscore; },
    v => { v.history.records[0].row.providerIds.espn = "999"; },
    v => { v.discovery.fixtures[0].home.name = "Away"; },
    v => { v.canonicalFixtures[0].providerTeamIds = { espn: { home: "101", away: "202" } };
      v.history.records[0].row.providerTeamIds = { espn: { home: "999", away: "202" } }; },
    v => { v.history.records.push(structuredClone(v.history.records[0])); }
  ]) { const value = input(); mutate(value); assert.equal(plan(value).changes.length, 0); }
});
test("provider kickoff disagreement does not mutate canonical kickoff during identity restoration", () => {
  const value = input(); value.discovery.fixtures[0].kickoffUtc = "2026-11-28T16:00Z";
  const result = plan(value);
  assert.equal(result.changes.length, 1);
  assert.equal(result.fixtures[0].kickoffUtc, "2026-11-28T15:00Z");
  assert.equal(result.fixtures[0].priorProviderBindingRestoration.providerKickoffUtc, "2026-11-28T16:00Z");
});
