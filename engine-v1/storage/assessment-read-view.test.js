import test from "node:test";
import assert from "node:assert/strict";
import { mergeAssessmentReadView } from "./assessment-read-view.js";
import { joinCanonicalFixturesWithModelAssessments } from "../core/plan-b-canonical-membership.js";

const row = (id, probability = 0.8) => ({ canonicalId: id, matchId: id, dayKey: "2026-10-01", aiAssessment: { markets: { OU25: { probs: { over: probability } } } } });
test("complementary inputs are retained even when live has fewer or equal rows", () => {
  const r = mergeAssessmentReadView([row("new")], [row("old"), row("old2")], "2026-10-01");
  assert.equal(r.assessmentRows, 3);
  assert.equal(r.source, "live_store_with_deploy_snapshot_assessments");
  assert.equal(mergeAssessmentReadView([row("new")], [row("old")]).assessmentRows, 2);
});
test("fresh live assessment wins, but a null live assessment does not erase persisted evidence", () => {
  const r = mergeAssessmentReadView([row("same", 0.9)], [row("same", 0.7)]);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].aiAssessment.markets.OU25.probs.over, 0.9);
  const unavailable = { ...row("same"), aiAssessment: null, market: { current: { home: 2 } } };
  const fallback = mergeAssessmentReadView([unavailable], [row("same")]);
  assert.equal(fallback.assessmentRows, 1);
  assert.deepEqual(fallback.matches[0].market, unavailable.market);
});
test("day boundaries and ambiguous duplicate inputs remain fail closed", () => {
  assert.equal(mergeAssessmentReadView([], [row("old")], "2026-10-02").assessmentRows, 0);
  const r = mergeAssessmentReadView([row("same"), row("same")], []);
  assert.equal(joinCanonicalFixturesWithModelAssessments([row("same")], r.matches).joinedMatches.length, 0);
});

test("publication keeps source-bound prior model separate from new prices lacking provider proof", () => {
  const prior = {
    ...row("fixture-a"),
    leagueSlug: "test.1",
    home: "Home",
    away: "Away",
    kickoffUtc: "2026-10-01T21:00:00.000Z",
    providerIds: { espn: "fixture-123" },
    market: { current: { home: 1.9 } }
  };
  const live = {
    ...prior,
    providerIds: {},
    aiAssessment: null,
    market: { current: { home: 2.1 } }
  };
  const result = mergeAssessmentReadView([live], [prior], "2026-10-01", { publication: true });
  assert.equal(result.assessmentRows, 1);
  assert.deepEqual(result.matches, [prior]);
  assert.notDeepEqual(result.matches[0].market, live.market);
});

test("publication carries model only after exact matching provider identity", () => {
  const prior = {
    ...row("fixture-a"),
    leagueSlug: "test.1",
    home: "Home",
    away: "Away",
    kickoffUtc: "2026-10-01T21:00:00.000Z",
    providerIds: { espn: "fixture-123" }
  };
  const live = { ...prior, aiAssessment: null, market: { current: { home: 2.1 } } };
  const result = mergeAssessmentReadView([live], [prior], "2026-10-01", { publication: true });
  assert.equal(result.assessmentRows, 1);
  assert.deepEqual(result.matches[0].aiAssessment, prior.aiAssessment);
  assert.deepEqual(result.matches[0].market, live.market);
});

test("publication never carries prior model across provider, team or kickoff conflicts", () => {
  const prior = {
    ...row("fixture-a"),
    leagueSlug: "test.1",
    home: "Home",
    away: "Away",
    kickoffUtc: "2026-10-01T21:00:00.000Z",
    providerIds: { espn: "fixture-123" }
  };
  for (const conflicting of [
    { providerIds: { espn: "different-fixture" } },
    { home: "Different team", providerIds: {} },
    { kickoffUtc: "2026-10-01T22:00:00.000Z", providerIds: {} }
  ]) {
    const live = { ...prior, ...conflicting, aiAssessment: null };
    const result = mergeAssessmentReadView([live], [prior], "2026-10-01", { publication: true });
    assert.equal(result.assessmentRows, 0);
  }
});

test("publication does not overwrite a fresh valid model with an old persisted model", () => {
  const prior = { ...row("fixture-a", 0.6), providerIds: { espn: "fixture-123" } };
  const live = { ...prior, aiAssessment: row("fixture-a", 0.9).aiAssessment };
  const result = mergeAssessmentReadView([live], [prior], "2026-10-01", { publication: true });
  assert.equal(result.matches[0].aiAssessment.markets.OU25.probs.over, 0.9);
});

test("future-day publication preservation is idempotent and never crosses day boundaries", () => {
  const prior = {
    ...row("future-fixture"),
    dayKey: "2026-12-03",
    leagueSlug: "test.1",
    home: "Alpha",
    away: "Beta",
    kickoffUtc: "2026-12-03T20:00:00.000Z",
    providerIds: { espn: "future-123" },
    market: { current: { home: 1.8 } }
  };
  const live = {
    ...prior,
    providerIds: {},
    aiAssessment: null,
    market: { current: { home: 2.3 } }
  };
  const first = mergeAssessmentReadView([live], [prior], "2026-12-03", { publication: true });
  const repeated = mergeAssessmentReadView([live], first.matches, "2026-12-03", { publication: true });
  assert.deepEqual(first.matches, [prior]);
  assert.deepEqual(repeated.matches, first.matches);
  assert.equal(repeated.assessmentRows, 1);
  assert.equal(mergeAssessmentReadView([], first.matches, "2026-12-04", { publication: true }).assessmentRows, 0);
});
