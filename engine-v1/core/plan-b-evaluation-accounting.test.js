import test from "node:test";
import assert from "node:assert/strict";
import { describePlanBMarketEligibility, describeOpponentAdjustment, completePlanBEvaluationAccounting } from "./plan-b-evaluation-accounting.js";
test("every fixture receives a terminal outcome, and missing input is not labelled legitimate zero", () => {
  const fixtures = [{ canonicalId: "missing" }, { canonicalId: "weak" }, { canonicalId: "rejected" }];
  const d = new Map([["missing", { reasonCode: "missing_model_assessment" }]]);
  const r = completePlanBEvaluationAccounting(fixtures, d, [{ canonicalId: "rejected", status: "rejected" }]);
  assert.equal(r.evaluationAccounting.complete, true);
  assert.equal(r.evaluationAccounting.terminalOutcomeCount, 3);
  assert.equal(r.evaluationAccounting.inputGapFixtures, 1);
  assert.equal(r.evaluationAccounting.diagnosis, "incomplete_assessment_coverage");
  assert.deepEqual(r.fixtureLedger.map(row => row.outcome), ["missing_model_assessment", "no_eligible_market", "candidates_rejected_by_policy"]);
});
test("fully assessed zero and duplicate fixture failure are distinct", () => {
  assert.equal(completePlanBEvaluationAccounting([{ canonicalId: "weak" }], new Map(), []).evaluationAccounting.diagnosis, "zero_picks_after_evaluation");
  assert.equal(completePlanBEvaluationAccounting([{ canonicalId: "same" }, { canonicalId: "same" }], new Map(), []).evaluationAccounting.complete, false);
});
test("pre-candidate reasons retain probability and form thresholds", () => {
  const r = describePlanBMarketEligibility({ aiAssessment: { markets: { OU25: { probs: { over: 0.64 } } }, model: { formUsed: true, homeFormSample: 6, awayFormSample: 2 } } });
  const over = r.find(row => row.market === "OU25" && row.pick === "over");
  assert.deepEqual(over.reasonCodes, ["below_model_probability_threshold", "insufficient_form_evidence"]);
  assert.equal(over.minimumProbability, 0.65);
});

test("B2 distinguishes missing opponent evidence, neutral impact and actual adjustment", () => {
  const profile = { sample: 6, sampleReliability: 0.6, impact: { ppg: 0, over25Rate: 0, bttsRate: 0 } };
  assert.equal(describeOpponentAdjustment({ standingsCoverage: 0, home: profile, away: profile }).status, "unavailable");
  assert.equal(describeOpponentAdjustment({ standingsCoverage: 10, home: profile, away: profile }).status, "neutral");
  const stronger = { ...profile, impact: { ...profile.impact, over25Rate: 0.2 } };
  const adjusted = describeOpponentAdjustment({ standingsCoverage: 10, home: stronger, away: profile });
  assert.equal(adjusted.status, "adjusted");
  assert.ok(adjusted.deltas.OU25.over > 0);
});

test("an orphan candidate cannot disappear from evaluation accounting", () => {
  const r = completePlanBEvaluationAccounting([{ canonicalId: "real" }], new Map(), [{ canonicalId: "orphan", status: "approved" }]);
  assert.equal(r.evaluationAccounting.complete, false);
});
