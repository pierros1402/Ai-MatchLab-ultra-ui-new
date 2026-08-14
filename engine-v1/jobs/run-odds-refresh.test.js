import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPersistedAssessmentPostcondition,
  persistedAssessmentSummary
} from "./run-odds-refresh.js";

test("persisted assessment summary counts only non-empty model markets", () => {
  const summary = persistedAssessmentSummary({
    matches: [
      { matchId: "a", aiAssessment: null },
      { matchId: "b", aiAssessment: { markets: {} } },
      { matchId: "c", aiAssessment: { markets: { OU25: { probs: { over: 0.6, under: 0.4 } } } } }
    ]
  });
  assert.deepEqual(summary, { matchRows: 3, assessmentRows: 1 });
});

test("refresh postcondition fails closed when persisted matches have zero assessments", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      { matches: [{ matchId: "a", aiAssessment: null }] },
      "2026-08-14"
    ),
    error => error?.code === "persisted_model_assessments_missing"
  );
});

test("non-empty canonical day cannot pass with an empty persisted snapshot", () => {
  assert.throws(
    () => assertPersistedAssessmentPostcondition(
      { matches: [] },
      "2026-08-14",
      { canonicalFixtureCount: 143 }
    ),
    error => error?.code === "persisted_model_assessments_missing" && error?.canonicalFixtureCount === 143
  );
});

test("refresh postcondition allows a genuinely empty canonical day", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition(
      { matches: [] },
      "2026-08-14",
      { canonicalFixtureCount: 0 }
    ),
    { matchRows: 0, assessmentRows: 0 }
  );
});

test("refresh postcondition allows persisted assessments", () => {
  assert.deepEqual(
    assertPersistedAssessmentPostcondition({
      matches: [{
        matchId: "a",
        aiAssessment: { markets: { BTTS: { probs: { yes: 0.5, no: 0.5 } } } }
      }]
    }, "2026-08-14", { canonicalFixtureCount: 143 }),
    { matchRows: 1, assessmentRows: 1 }
  );
});
