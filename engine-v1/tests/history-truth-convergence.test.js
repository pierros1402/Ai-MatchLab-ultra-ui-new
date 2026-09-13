import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRefreshVerifiedFinalTruth,
  summarizeHistoryTruthParity
} from "../core/history-truth-convergence.js";

test("missing verified finals trigger autonomous history truth refresh", () => {
  assert.equal(shouldRefreshVerifiedFinalTruth({
    ok: false,
    errors: [{ reason: "canonical_final_missing_verified_final", matchId: "m2" }]
  }), true);
});

test("structural conflicts never trigger automatic evidence overwrite", () => {
  for (const reason of [
    "canonical_verified_final_score_mismatch",
    "canonical_verified_final_team_mismatch",
    "verified_final_missing_canonical_fixture",
    "verified_final_canonical_nonterminal"
  ]) {
    assert.equal(shouldRefreshVerifiedFinalTruth({
      ok: false,
      errors: [{ reason, matchId: "m1" }]
    }), false, reason);
  }
});

test("parity summary counts reasons and bounds samples", () => {
  const summary = summarizeHistoryTruthParity({
    ok: false,
    reason: "history_truth_parity_failed",
    dayKey: "2026-09-10",
    canonicalFixtureCount: 5,
    canonicalPlayedFinalCount: 4,
    verifiedFinalCount: 2,
    acceptedRows: 2,
    errors: [
      { reason: "canonical_final_missing_verified_final", matchId: "a" },
      { reason: "canonical_final_missing_verified_final", matchId: "b" },
      { reason: "canonical_verified_final_score_mismatch", matchId: "c" }
    ]
  }, { sampleLimit: 2 });
  assert.equal(summary.errorCount, 3);
  assert.deepEqual(summary.byReason, {
    canonical_final_missing_verified_final: 2,
    canonical_verified_final_score_mismatch: 1
  });
  assert.equal(summary.sampleErrors.length, 2);
});
