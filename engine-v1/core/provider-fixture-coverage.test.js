import test from "node:test";
import assert from "node:assert/strict";
import { providerFixtureIdentity, PROVIDER_FIXTURE_IDENTITY_SCHEMA } from "./provider-fixture-identity.js";
import { buildProviderFixtureCoverage, collectProviderFixtureCoverageIssues } from "./provider-fixture-coverage.js";

const dayKey = "2026-11-28";
const now = "2026-11-28T19:00:00Z";
function input() {
  const fixture = providerFixtureIdentity({
    matchId: "FS1", kickoffUtc: "2026-11-28T15:00:00Z",
    home: "Home", away: "Away",
    homeProviderTeamId: "H", awayProviderTeamId: "A", statusCode: "1"
  }, { acquisitionEligible: true, canonicalSlug: "eng.1", providerCompetitionId: "E" }, dayKey);
  const canonical = {
    canonicalId: "CID1", leagueSlug: "eng.1", dayKey, kickoffUtc: fixture.kickoffUtc,
    providerIds: { flashscore: "FS1" },
    providerTeamIds: { flashscore: { home: "H", away: "A" } }
  };
  return { dayKey, now, discovery: { ok: true, dayKey, generatedAt: now,
    fixtureIdentitySchema: PROVIDER_FIXTURE_IDENTITY_SCHEMA, fixtures: [fixture] },
    canonicalFixtures: [canonical], publishedFixtures: [{ ...canonical }],
    publishedDetails: [{ canonicalId: "CID1" }] };
}
const codes = value => buildProviderFixtureCoverage(value).issues.map(i => i.reasonCode);

test("complete exact namespaced provider binding is proven", () => {
  assert.equal(buildProviderFixtureCoverage(input()).proven, true);
});
test("same counts with different IDs cannot prove coverage", () => {
  const value = input(); value.canonicalFixtures[0].providerIds.flashscore = "OTHER";
  assert.ok(codes(value).includes("missing_canonical_binding"));
});
test("one truly missing fixture is reported", () => {
  const value = input(); value.canonicalFixtures = [];
  assert.ok(codes(value).includes("missing_canonical_binding"));
});
test("duplicate discovery IDs remain visible", () => {
  const value = input(); value.discovery.fixtures.push({ ...value.discovery.fixtures[0] });
  assert.ok(codes(value).includes("duplicate_provider_fixture_id"));
});
test("canonical wrong day is detected from kickoff", () => {
  const value = input(); value.canonicalFixtures[0].kickoffUtc = "2026-11-29T15:00Z";
  assert.ok(codes(value).includes("wrong_day_fixture"));
});
test("canonical wrong league is detected", () => {
  const value = input(); value.canonicalFixtures[0].leagueSlug = "esp.1";
  assert.ok(codes(value).includes("wrong_league_fixture"));
});
test("home away reversal is detected from provider team IDs", () => {
  const value = input(); value.canonicalFixtures[0].providerTeamIds.flashscore = { home: "A", away: "H" };
  assert.ok(codes(value).includes("home_away_identity_conflict"));
});
test("team names never substitute for provider identity", () => {
  const value = input(); delete value.canonicalFixtures[0].providerTeamIds;
  assert.ok(codes(value).includes("provider_team_identity_unverified"));
});
test("ambiguous canonical bindings fail closed", () => {
  const value = input(); value.canonicalFixtures.push({ ...value.canonicalFixtures[0], canonicalId: "CID2" });
  assert.ok(codes(value).includes("ambiguous_canonical_binding"));
});
test("legal scope exclusions create no acquisition obligation", () => {
  const value = input(); value.discovery.fixtures[0].eligibility = "excluded";
  value.discovery.fixtures[0].exclusionReason = "explicit_scope_exclusion";
  value.canonicalFixtures = []; value.publishedFixtures = []; value.publishedDetails = [];
  assert.deepEqual(codes(value), []);
});
test("identity ledger omissions cannot hide behind aggregate counts", () => {
  const value = input();
  value.discovery.competitions = [{ acquisitionEligible: true, canonicalSlug: "eng.1", targetDayFixtureCount: 2 }];
  assert.ok(codes(value).includes("unexplained_fixture_count_discrepancy"));
});
test("wrong-day eligible discovery and unexplained exclusions are invalid", () => {
  const value = input();
  value.discovery.fixtures[0].kickoffUtc = "2026-11-29T15:00Z";
  assert.ok(codes(value).includes("provider_fixture_wrong_day"));
  value.discovery.fixtures[0].eligibility = "excluded";
  assert.ok(codes(value).includes("provider_fixture_exclusion_unexplained"));
});
test("non played terminal is classified separately", () => {
  const value = providerFixtureIdentity({ matchId: "FS2", kickoffUtc: "2026-11-28T15:00Z",
    nonPlayedTerminal: true }, { acquisitionEligible: true }, dayKey);
  assert.equal(value.eligibility, "excluded");
  assert.equal(value.exclusionReason, "non_played_terminal");
});
test("outage, missing, stale and legacy discovery cannot prove coverage", () => {
  for (const [mutate, reason] of [
    [v => { v.discovery.ok = false; }, "provider_discovery_outage"],
    [v => { v.discovery = null; }, "provider_discovery_missing"],
    [v => { v.discovery.generatedAt = "2026-11-26T15:00Z"; }, "provider_discovery_stale"],
    [v => { delete v.discovery.fixtures; }, "provider_fixture_identity_contract_missing"]
  ]) {
    const value = input(); mutate(value); assert.ok(codes(value).includes(reason));
  }
});
test("unexpected publication and missing details are actionable", () => {
  const value = input(); value.publishedFixtures.push({ canonicalId: "ORPHAN" });
  value.publishedDetails = [];
  const report = buildProviderFixtureCoverage(value);
  assert.ok(report.issues.some(i => i.reasonCode === "unexpected_published_fixture"));
  assert.ok(report.issues.some(i => i.reasonCode === "missing_published_details"));
  const issue = collectProviderFixtureCoverageIssues(report)[0];
  assert.ok(issue.details.recoveryAction); assert.ok(issue.details.affectedArtifact);
  assert.ok(issue.details.freshness); assert.equal(issue.severity, "error");
});
test("published wrong provider, league, day and detail league are diagnosed", () => {
  const value = input();
  value.publishedFixtures[0] = { ...value.publishedFixtures[0],
    providerIds: { flashscore: "OTHER" }, leagueSlug: "esp.1", kickoffUtc: "2026-11-29T15:00Z" };
  value.publishedDetails[0].basic = { leagueSlug: "esp.1" };
  for (const reason of ["published_provider_identity_conflict", "published_wrong_league_fixture",
    "published_wrong_day_fixture", "details_wrong_league_fixture"])
    assert.ok(codes(value).includes(reason));
});
test("provider namespace is never inferred from an unqualified ID", () => {
  const value = input(); value.canonicalFixtures[0].providerIds = {};
  value.canonicalFixtures[0].sourceId = "FS1"; value.canonicalFixtures[0].source = "espn";
  assert.ok(codes(value).includes("missing_canonical_binding"));
});
