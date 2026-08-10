import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_TRUTH_ADJUDICATION_SCHEMA,
  deterministicAdjudicationId,
  validateFinalTruthAdjudication,
} from "./final-truth-adjudication.js";

function row(overrides = {}) {
  const base = {
    schema: FINAL_TRUTH_ADJUDICATION_SCHEMA,
    state: "APPROVED_FOR_RECOVERY",
    dayKey: "2026-08-08",
    matchId: "cid_test",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 2,
    awayScore: 1,
    evidence: [
      { authority: "source-a", reference: "a" },
      { authority: "source-b", reference: "b" },
    ],
  };
  const value = { ...base, ...overrides };
  value.adjudicationId = deterministicAdjudicationId(value);
  return value;
}

test("valid adjudication requires deterministic ID and two evidence records", () => {
  assert.equal(validateFinalTruthAdjudication(row()).ok, true);
});

test("single-source adjudication is rejected", () => {
  const value = row({ evidence: [{ authority: "source-a", reference: "a" }] });
  value.adjudicationId = deterministicAdjudicationId(value);
  const result = validateFinalTruthAdjudication(value);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("INSUFFICIENT_INDEPENDENT_EVIDENCE"));
});

test("mutating truth without updating deterministic ID is rejected", () => {
  const value = row();
  value.homeScore = 3;
  const result = validateFinalTruthAdjudication(value);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ADJUDICATION_ID_MISMATCH"));
});
