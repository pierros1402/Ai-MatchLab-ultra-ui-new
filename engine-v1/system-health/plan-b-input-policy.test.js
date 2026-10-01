import test from "node:test";
import assert from "node:assert/strict";
import { collectPlanBInputIssues } from "./plan-b-input-policy.js";
test("legacy audits expose input gaps without requiring historical regeneration", () => {
  const r = collectPlanBInputIssues({ B: { membership: { canonicalRowsWithoutAssessment: 29 } } });
  assert.equal(r[0].severity, "warning");
  assert.equal(r[0].type, "plan_b_assessment_coverage_incomplete");
});
test("complete strict-zero evaluation is quiet, while broken accounting is an error", () => {
  assert.deepEqual(collectPlanBInputIssues({ B: { evaluationAccounting: { complete: true } } }), []);
  assert.equal(collectPlanBInputIssues({ B2: { evaluationAccounting: { complete: false } } })[0].severity, "error");
});
test("B2 records unavailable adjustment independently from a zero pick count", () => {
  assert.equal(collectPlanBInputIssues({ B2: { fixtureLedger: [{ opponentAdjustment: { status: "unavailable" } }] } })[0].type, "plan_b2_opponent_adjustment_unavailable");
});
