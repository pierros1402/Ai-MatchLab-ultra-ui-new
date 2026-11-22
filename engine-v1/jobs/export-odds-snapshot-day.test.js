import test from "node:test";
import assert from "node:assert/strict";

import {
  assessmentRowCount,
  contentHash,
  snapshotRegressionReason,
  quarantineAmbiguousAssessmentModels
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


test("ambiguous historical assessment aliases quarantine only implicated models, preserving raw evidence", () => {
  const fixtureA = { ...row(0.55, "cid_a"), providerIds: { espn: "100" } };
  const fixtureB = { ...row(0.55, "cid_b"), providerIds: { espn: "200" } };
  const stale = { ...row(0.51, "cid_old"), providerIds: { espn: "100" }, market: { bookmaker: 2.3 } };
  const fresh = { ...fixtureA, aiAssessment: row(0.65).aiAssessment };
  const independent = { ...fixtureB };
  const inputs = [stale, fresh, independent];
  const result = quarantineAmbiguousAssessmentModels([fixtureA, fixtureB], inputs);
  assert.equal(result.initial.ambiguousAssessmentAliases.length > 0, true);
  assert.equal(result.rows[0].aiAssessment, null);
  assert.equal(result.rows[1].aiAssessment, null);
  assert.deepEqual(result.rows[0].market, stale.market);
  assert.equal(result.rows[2].aiAssessment, independent.aiAssessment);
  assert.equal(inputs[0].aiAssessment, stale.aiAssessment);
});

test("no alias collision leaves assessed rows untouched", () => {
  const fixture = { ...row(), providerIds: { espn: "501" } };
  const result = quarantineAmbiguousAssessmentModels([fixture], [fixture]);
  assert.deepEqual(result.quarantinedIds, []);
  assert.equal(result.rows[0], fixture);
});
