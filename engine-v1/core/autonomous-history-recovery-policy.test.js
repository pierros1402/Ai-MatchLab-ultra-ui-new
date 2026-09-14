import test from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_RECOVERY_ESCALATION_THRESHOLD,
  classifyHistoryRecovery,
  historyRowsEquivalent,
  nextRecoveryState,
  shouldAttemptVerifiedFinalRecovery
} from "./autonomous-history-recovery-policy.js";

test("healthy build stays non-actionable", () => {
  const classification = classifyHistoryRecovery({
    hasCanonical: true,
    readiness: { terminal: 4, open: 0, terminalMissingScore: 0, duplicateIdCount: 0 },
    build: { ok: true },
    historyChanged: false
  });
  assert.equal(classification.state, "healthy");
  assert.equal(classification.immediatelyActionable, false);
});

test("successful history replacement is classified as repaired", () => {
  const classification = classifyHistoryRecovery({
    hasCanonical: true,
    readiness: { terminal: 4, open: 0, terminalMissingScore: 0, duplicateIdCount: 0 },
    build: { ok: true },
    historyChanged: true
  });
  assert.equal(classification.state, "repaired");
});

test("missing verified final truth selects targeted exact-evidence retry", () => {
  const build = {
    ok: false,
    reason: "history_truth_parity_failed",
    errors: [
      { reason: "canonical_final_missing_verified_final", matchId: "m1" }
    ]
  };
  assert.equal(shouldAttemptVerifiedFinalRecovery(build), true);
  const classification = classifyHistoryRecovery({
    hasCanonical: true,
    readiness: { terminal: 1, open: 0, terminalMissingScore: 0, duplicateIdCount: 0 },
    build
  });
  assert.equal(classification.state, "pending_verified_final");
  assert.equal(classification.retryAction, "refresh_verified_final_results_then_retry");
  assert.equal(classification.immediatelyActionable, false);
});

test("score mismatch blocks destructive autonomous repair immediately", () => {
  const classification = classifyHistoryRecovery({
    hasCanonical: true,
    readiness: { terminal: 1, open: 0, terminalMissingScore: 0, duplicateIdCount: 0 },
    build: {
      ok: false,
      errors: [{ reason: "canonical_verified_final_score_mismatch", matchId: "m1" }]
    }
  });
  assert.equal(classification.state, "blocked_integrity");
  assert.equal(classification.retryAction, "human_truth_review");
  assert.equal(classification.immediatelyActionable, true);
});

test("open truth remains pending and does not manufacture a final", () => {
  const classification = classifyHistoryRecovery({
    hasCanonical: true,
    readiness: { terminal: 3, open: 1, terminalMissingScore: 0, duplicateIdCount: 0 },
    build: { ok: false, reason: "no_verified_terminal_rows", errors: [] }
  });
  assert.equal(classification.state, "pending_truth");
  assert.equal(classification.retryAction, "provider_status_refresh_then_retry");
});

test("repeated identical pending reason escalates only after threshold", () => {
  const classification = {
    state: "pending_truth",
    reasons: ["open_or_unverified_truth_remaining"],
    retryAction: "provider_status_refresh_then_retry",
    immediatelyActionable: false
  };
  let state = null;
  for (let i = 1; i <= HISTORY_RECOVERY_ESCALATION_THRESHOLD; i += 1) {
    state = nextRecoveryState({
      dayKey: "2026-09-13",
      previous: state,
      classification,
      now: new Date(`2026-09-14T0${i}:00:00.000Z`)
    });
    if (i < HISTORY_RECOVERY_ESCALATION_THRESHOLD) {
      assert.equal(state.actionable, false);
    }
  }
  assert.equal(state.consecutiveFailureCount, HISTORY_RECOVERY_ESCALATION_THRESHOLD);
  assert.equal(state.actionable, true);
  assert.equal(state.persistentActionable, true);
});

test("success resets consecutive failure memory", () => {
  const previous = {
    firstSeenAt: "2026-09-14T00:00:00.000Z",
    attemptCount: 4,
    consecutiveFailureCount: 4,
    lastReasonKey: "pending_truth|open_or_unverified_truth_remaining"
  };
  const state = nextRecoveryState({
    dayKey: "2026-09-13",
    previous,
    classification: {
      state: "repaired",
      reasons: [],
      retryAction: "none",
      immediatelyActionable: false
    },
    now: new Date("2026-09-14T05:00:00.000Z")
  });
  assert.equal(state.consecutiveFailureCount, 0);
  assert.equal(state.actionable, false);
  assert.equal(state.attemptCount, 5);
  assert.equal(state.repairedAt, "2026-09-14T05:00:00.000Z");
});

test("history comparison ignores rebuild timestamps but detects truth changes", () => {
  const base = [{
    id: "m1",
    dayKey: "2026-09-13",
    kickoff: "2026-09-13T18:00:00.000Z",
    leagueSlug: "x.1",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: 2,
    scoreAway: 1,
    status: "FT",
    outcome: "HOME",
    source: "verified-final",
    rebuiltAt: 1,
    truthContract: { verifiedFinalTruth: true }
  }];
  const same = [{ ...base[0], rebuiltAt: 999 }];
  const changed = [{ ...base[0], scoreHome: 3, rebuiltAt: 999 }];
  assert.equal(historyRowsEquivalent(base, same), true);
  assert.equal(historyRowsEquivalent(base, changed), false);
});
