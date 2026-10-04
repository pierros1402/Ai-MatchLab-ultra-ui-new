import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalAssessmentOwnership, joinCanonicalFixturesWithModelAssessments } from "./plan-b-canonical-membership.js";
const fixture = { canonicalId: "cid_current", dayKey: "2026-10-04", leagueSlug: "uefa.nations", homeTeam: "Portugal", awayTeam: "Norway",
  kickoffUtc: "2026-10-04T18:45Z", providerIds: { flashscore: "Ei1jt6O0" } };
const leader = { ...fixture, aiAssessment: { inputSource: "canonical_fixture_cross_competition_team_form_fallback", markets: { OU25: { probs: { over: 0.56 } } } } };
const old = { ...fixture, canonicalId: "cid_legacy", leagueSlug: "uefa.nationsleague", market: { bookmaker: 2.1 },
  aiAssessment: { model: { source: "ai_poisson_national_prior" }, markets: { OU25: { probs: { over: 0.545 } } } } };
test("unique explicit canonical producer supersedes legacy alias while preserving original model and bookmaker evidence", () => {
  const before = JSON.stringify([leader, old]);
  const result = resolveCanonicalAssessmentOwnership([fixture], [old, leader]);
  assert.equal(result.superseded.length, 1);
  assert.equal(result.matches[0].aiAssessment, null);
  assert.deepEqual(result.matches[0].supersededAiAssessment, old.aiAssessment);
  assert.deepEqual(result.matches[0].market, old.market);
  const joined = joinCanonicalFixturesWithModelAssessments([fixture], result.matches);
  assert.equal(joined.summary.joinedMatches, 1);
  assert.equal(joined.joinedMatches[0].aiAssessment, leader.aiAssessment);
  assert.equal(JSON.stringify([leader, old]), before);
  assert.deepEqual(resolveCanonicalAssessmentOwnership([fixture], result.matches).matches, result.matches);
});
test("two canonical producers, changed time, global identity conflict, or no authoritative producer remain ambiguous", () => {
  for (const row of [{ ...old, aiAssessment: leader.aiAssessment }, { ...old, kickoffUtc: "2026-10-04T20:00Z" },
    { ...old, dayKey: "2026-10-05" }, { ...old, homeGlobalClubId: "wrong" }]) {
    const selected = { ...leader, homeGlobalClubId: "correct" };
    assert.equal(resolveCanonicalAssessmentOwnership([fixture], [selected, row]).superseded.length, 0);
  }
  assert.equal(resolveCanonicalAssessmentOwnership([fixture], [{ ...leader, aiAssessment: old.aiAssessment }, old]).superseded.length, 0);
  assert.equal(resolveCanonicalAssessmentOwnership([fixture], [leader, { ...leader }]).superseded.length, 0);
});
test("shared provider identity across canonical fixtures cannot authorize supersession", () => {
  assert.equal(resolveCanonicalAssessmentOwnership([fixture, { ...fixture, canonicalId: "cid_other" }], [leader, old]).superseded.length, 0);
});
