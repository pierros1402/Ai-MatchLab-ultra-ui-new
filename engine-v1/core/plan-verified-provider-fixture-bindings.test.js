import test from "node:test";
import assert from "node:assert/strict";
import { planVerifiedProviderFixtureBindings as plan } from "./plan-verified-provider-fixture-bindings.js";
function input() {
  const side = (name, native) => ({ canonicalTeam: name, providerTeamId: native,
    canonicalIds: ["cid_seed1", "cid_seed2"], days: ["2026-10-01", "2026-10-08"],
    providerMatchIds: ["seed0001", "seed0002"] });
  return { canonicalFixtures: [{ canonicalId: "cid_current", source: "espn", sourceId: "123",
    providerIds: { espn: "123" }, providerTeamIds: { espn: { home: "101", away: "202" } },
    leagueSlug: "eng.1", dayKey: "2026-11-28", kickoffUtc: "2026-11-28T15:00Z",
    homeTeam: "Home", awayTeam: "Away", status: "FT", scoreHome: 2, scoreAway: 1 }],
    audit: { schema: "ai-matchlab.r04-existing-verified-provider-binding-audit.v1",
      policy: "existing_two_original_verified_finals_no_seed_propagation", dayKey: "2026-11-28",
      sourceSha: "a".repeat(40), discoveryHash: "hash", generatedAt: "2026-11-28T20:00Z",
      proposals: [{ canonicalId: "cid_current", providerFixtureId: "fixture1", leagueSlug: "eng.1",
        proof: { schema: "ai-matchlab.verified-provider-identity-link.v1", canonicalIdentityUnchanged: true,
          canonicalId: "cid_current", providerMatchId: "fixture1", espnMatchId: "123",
          leagueSlug: "eng.1", kickoffUtc: "2026-11-28T15:00Z",
          sides: { home: side("Home", "nativeH1"), away: side("Away", "nativeA1") } } }] } };
}
test("two original finals bind exact native identity without changing canonical truth", () => {
  const value = input(), original = structuredClone(value);
  const result = plan(value), row = result.fixtures[0];
  assert.equal(result.changes.length, 1);
  assert.deepEqual(value, original);
  const { providerIds, providerTeamIds, providerIdentityLink, providerFixtureBindingEvidence, ...truth } = row;
  const { providerIds: oldIds, providerTeamIds: oldTeams, ...oldTruth } = original.canonicalFixtures[0];
  assert.deepEqual(truth, oldTruth);
  assert.equal(providerIds.espn, oldIds.espn);
  assert.deepEqual(providerTeamIds.espn, oldTeams.espn);
});
test("single seed and current-match seed cannot bootstrap a binding", () => {
  for (const mutate of [
    v => { v.audit.proposals[0].proof.sides.home.days = ["2026-10-01"]; },
    v => { v.audit.proposals[0].proof.sides.home.canonicalIds.push("cid_current"); },
    v => { v.audit.proposals[0].proof.sides.away.providerMatchIds.push("fixture1"); }
  ]) { const value = input(); mutate(value); assert.equal(plan(value).changes.length, 0); }
});
test("wrong kickoff, league, side, ESPN identity, quarantine and duplicate claims fail closed", () => {
  for (const mutate of [
    v => { v.canonicalFixtures[0].kickoffUtc = "2026-11-28T16:00Z"; },
    v => { v.canonicalFixtures[0].leagueSlug = "esp.1"; },
    v => { v.audit.proposals[0].proof.sides.home.canonicalTeam = "Away"; },
    v => { v.canonicalFixtures[0].sourceId = "999"; },
    v => { v.canonicalFixtures[0].providerTeamIdentityConflict = true; },
    v => { v.audit.proposals.push(structuredClone(v.audit.proposals[0])); }
  ]) { const value = input(); mutate(value); assert.equal(plan(value).changes.length, 0); }
});
test("an existing provider fixture binding is never replaced", () => {
  const value = input(); value.canonicalFixtures[0].providerIds.flashscore = "different";
  assert.equal(plan(value).changes.length, 0);
});
test("exact ESPN native side IDs preserve reviewed display aliases, while contradictory native IDs fail", () => {
  const value = input(); value.audit.proposals[0].proof.sides.home.canonicalTeam = "Reviewed Home Display";
  value.audit.proposals[0].proof.canonicalProviderTeamIds = { home: "101", away: "202" };
  assert.equal(plan(value).changes.length, 1);
  value.audit.proposals[0].proof.canonicalProviderTeamIds.home = "999";
  assert.equal(plan(value).changes.length, 0);
  value.audit.proposals[0].proof.sides.home.canonicalTeam = "Home";
  assert.equal(plan(value).changes.length, 0);
});
function aliasInput() {
  const value = input(); value.audit.proposals = [];
  value.canonicalFixtures[0].providerIds.flashscore = "fixture1";
  const side = n => ({
    sameApprovedGlobalClub: true,
    canonicalTeam: { ok: true, fuzzyMatchingAttempted: false, globalClubId: "gcid_" + n.repeat(24) },
    providerTeam: { ok: true, fuzzyMatchingAttempted: false, globalClubId: "gcid_" + n.repeat(24) }
  });
  value.audit.existingBindingAliasEvidence = [{ canonicalId: "cid_current", providerFixtureId: "fixture1",
    leagueSlug: "eng.1", exactKickoff: true, sides: { home: side("1"), away: side("2") } }];
  value.discovery = { hash: "discovery", generatedAt: "2026-11-28T19:00Z", fixtures: [{
    provider: "flashscore", providerFixtureId: "fixture1", canonicalSlug: "eng.1",
    dayKey: "2026-11-28", kickoffUtc: "2026-11-28T15:00Z",
    home: { providerTeamId: "nativeH1" }, away: { providerTeamId: "nativeA1" }
  }] };
  return value;
}
test("approved exact global aliases enrich an existing fixture binding without changing truth", () => {
  const value = aliasInput(), before = structuredClone(value);
  const result = plan(value);
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].type, "approved_alias_native_pair");
  assert.deepEqual(value, before);
  assert.deepEqual(result.fixtures[0].providerIds, before.canonicalFixtures[0].providerIds);
  assert.equal(result.fixtures[0].scoreHome, 2);
});
test("fuzzy, conflicting or same-club alias evidence cannot authorize native identity", () => {
  for (const mutate of [
    v => { v.audit.existingBindingAliasEvidence[0].sides.home.providerTeam.fuzzyMatchingAttempted = true; },
    v => { v.audit.existingBindingAliasEvidence[0].sides.home.providerTeam.globalClubId = "gcid_" + "3".repeat(24); },
    v => { v.audit.existingBindingAliasEvidence[0].sides.away = v.audit.existingBindingAliasEvidence[0].sides.home; }
  ]) { const value = aliasInput(); mutate(value); assert.equal(plan(value).changes.length, 0); }
});
