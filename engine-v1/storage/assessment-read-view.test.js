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
