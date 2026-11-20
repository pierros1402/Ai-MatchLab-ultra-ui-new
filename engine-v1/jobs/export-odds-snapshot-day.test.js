import test from "node:test";
import assert from "node:assert/strict";

import {
  assessmentRowCount,
  contentHash,
  snapshotRegressionReason,
  preserveCertifiedAssessmentCoverage
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

test("carry forward exact canonical certified assessment without replacing fresh rows", () => {
  const older = row(0.55);
  const current = { ...row(0.61), aiAssessment: null };
  const fresh = row(0.63, "cid_test_other_away_20260813");
  const canonical = [
    { ...older, aiAssessment: null },
    { ...fresh, aiAssessment: null }
  ];
  const result = preserveCertifiedAssessmentCoverage([older], [current, fresh], canonical);
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches[0].aiAssessment, older.aiAssessment);
  assert.deepEqual(result.matches[1].aiAssessment, fresh.aiAssessment);
  assert.equal(snapshotRegressionReason([older], result.matches, canonical), null);
});

test("carry forward restores certified canonical row absent from fresh capture", () => {
  const prior = row(0.55);
  const other = row(0.6, "cid_test_other_away_20260813");
  const canonical = [{ ...prior, aiAssessment: null }, { ...other, aiAssessment: null }];
  const result = preserveCertifiedAssessmentCoverage([prior], [other], canonical);
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[1].canonicalId, prior.canonicalId);
  assert.deepEqual(result.matches[1].aiAssessment, prior.aiAssessment);
});

test("carry forward never invents evidence for a newly acquired fixture", () => {
  const prior = row(0.55);
  const freshMissing = { ...row(0.61, "cid_test_new_away_20260813"), aiAssessment: null };
  const canonical = [{ ...prior, aiAssessment: null }, { ...freshMissing }];
  const result = preserveCertifiedAssessmentCoverage([prior], [prior, freshMissing], canonical);
  assert.equal(result.ok, true);
  assert.equal(result.matches[1].aiAssessment, null);
});

test("carry forward rejects legacy evidence outside exact canonical identity", () => {
  const prior = row(0.55);
  const candidate = { ...row(0.61, "cid_test_new_away_20260813"), aiAssessment: null };
  const result = preserveCertifiedAssessmentCoverage([prior], [candidate], [
    { ...candidate, aiAssessment: null }
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].aiAssessment, null);
});
