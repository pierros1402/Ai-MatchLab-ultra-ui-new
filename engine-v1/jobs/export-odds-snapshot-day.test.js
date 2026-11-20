import test from "node:test";
import assert from "node:assert/strict";

import {
  assessmentRowCount,
  contentHash,
  snapshotRegressionReason
} from "./export-odds-snapshot-day.js";

function row(prob = 0.55, id = "cid_test_home_away_20260813") {
  return {
    matchId: id,
    canonicalId: id,
    leagueSlug: "test.1",
    competition: "Test League",
    home: "Home",
    away: "Away",
    dayKey: "2026-08-13",
    kickoffUtc: "2026-08-13T18:00:00.000Z",
    market: null,
    aiAssessment: {
      model: { source: "ai_poisson" },
      markets: { OU25: { probs: { over: prob, under: 1 - prob } } }
    }
  };
}

test("odds snapshot hash is stable for identical model assessments", () => {
  assert.equal(contentHash([row()]), contentHash([row()]));
});

test("odds snapshot hash changes when only aiAssessment.markets changes", () => {
  assert.notEqual(contentHash([row(0.55)]), contentHash([row(0.61)]));
});

test("strict assessment count ignores odds-only rows", () => {
  assert.equal(assessmentRowCount([
    row(),
    { ...row(0.55, "b"), aiAssessment: null },
    { ...row(0.55, "c"), aiAssessment: { markets: {} } }
  ]), 1);
});

test("existing assessed snapshot cannot be replaced by an empty candidate", () => {
  assert.equal(snapshotRegressionReason([row()], []), "candidate_empty_regression");
});

test("assessment coverage cannot regress", () => {
  assert.equal(
    snapshotRegressionReason([row(), row(0.55, "b")], [row()]),
    "assessment_coverage_regression"
  );
});

test("equal assessment coverage is not treated as regression", () => {
  assert.equal(snapshotRegressionReason([row()], [row(0.61)]), null);
});
