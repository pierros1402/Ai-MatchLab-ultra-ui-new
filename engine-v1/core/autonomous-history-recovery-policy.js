export const HISTORY_RECOVERY_ESCALATION_THRESHOLD = 3;

const TARGETED_FINAL_RESULT_REASONS = new Set([
  "canonical_final_missing_verified_final",
  "verified_final_contract_required",
  "verified_final_numeric_score_required"
]);

const INTEGRITY_BLOCK_REASONS = new Set([
  "canonical_status_conflict",
  "canonical_identity_duplicate",
  "verified_final_identity_duplicate",
  "canonical_verified_final_score_mismatch",
  "canonical_verified_final_team_mismatch",
  "verified_final_missing_canonical_fixture",
  "canonical_day_mismatch",
  "verified_final_day_mismatch"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildErrorReasonCounts(build) {
  const counts = {};
  for (const row of Array.isArray(build?.errors) ? build.errors : []) {
    const reason = clean(row?.reason) || "unknown_history_recovery_error";
    counts[reason] = (counts[reason] || 0) + 1;
  }
  if (!Object.keys(counts).length && build?.ok === false && build?.reason) {
    counts[clean(build.reason)] = 1;
  }
  return counts;
}

export function shouldAttemptVerifiedFinalRecovery(build) {
  const reasons = Object.keys(buildErrorReasonCounts(build));
  return reasons.some(reason => TARGETED_FINAL_RESULT_REASONS.has(reason));
}

export function classifyHistoryRecovery({
  hasCanonical = false,
  readiness = null,
  build = null,
  historyChanged = false
} = {}) {
  if (!hasCanonical) {
    return {
      state: "skipped",
      reasons: ["no_canonical_day"],
      retryAction: "none",
      immediatelyActionable: false,
      historyChanged: false
    };
  }

  if (build?.ok === true) {
    return {
      state: historyChanged ? "repaired" : "healthy",
      reasons: [],
      retryAction: "none",
      immediatelyActionable: false,
      historyChanged: Boolean(historyChanged)
    };
  }

  const reasonCounts = buildErrorReasonCounts(build);
  const reasons = Object.keys(reasonCounts).sort();
  const duplicateIdCount = numeric(readiness?.duplicateIdCount);
  const terminalMissingScore = numeric(readiness?.terminalMissingScore);
  const open = numeric(readiness?.open);
  const terminal = numeric(readiness?.terminal);

  if (
    duplicateIdCount > 0 ||
    reasons.some(reason => INTEGRITY_BLOCK_REASONS.has(reason))
  ) {
    return {
      state: "blocked_integrity",
      reasons: reasons.length ? reasons : ["duplicate_canonical_identity"],
      reasonCounts,
      retryAction: "human_truth_review",
      immediatelyActionable: true,
      historyChanged: false
    };
  }

  if (shouldAttemptVerifiedFinalRecovery(build)) {
    return {
      state: "pending_verified_final",
      reasons,
      reasonCounts,
      retryAction: "refresh_verified_final_results_then_retry",
      immediatelyActionable: false,
      historyChanged: false
    };
  }

  if (terminalMissingScore > 0) {
    return {
      state: "pending_truth",
      reasons: reasons.length ? reasons : ["terminal_missing_numeric_score"],
      reasonCounts,
      retryAction: "provider_status_refresh_then_retry",
      immediatelyActionable: false,
      historyChanged: false
    };
  }

  if (open > 0 || terminal === 0 || reasons.includes("no_verified_terminal_rows")) {
    return {
      state: "pending_truth",
      reasons: reasons.length ? reasons : ["open_or_unverified_truth_remaining"],
      reasonCounts,
      retryAction: "provider_status_refresh_then_retry",
      immediatelyActionable: false,
      historyChanged: false
    };
  }

  return {
    state: "operational_retry",
    reasons: reasons.length ? reasons : [clean(build?.reason) || "history_recovery_retry_required"],
    reasonCounts,
    retryAction: "retry_next_checkpoint",
    immediatelyActionable: false,
    historyChanged: false
  };
}

export function recoveryReasonKey(classification) {
  return [
    clean(classification?.state),
    ...(Array.isArray(classification?.reasons) ? classification.reasons.map(clean).filter(Boolean).sort() : [])
  ].join("|");
}

export function nextRecoveryState({
  dayKey,
  previous = null,
  classification,
  actions = [],
  now = new Date(),
  escalationThreshold = HISTORY_RECOVERY_ESCALATION_THRESHOLD
} = {}) {
  const state = clean(classification?.state) || "operational_retry";
  const reasonKey = recoveryReasonKey(classification);
  const previousReasonKey = clean(previous?.lastReasonKey);
  const successful = ["healthy", "repaired", "skipped"].includes(state);
  const sameFailure = !successful && previousReasonKey === reasonKey;
  const consecutiveFailureCount = successful
    ? 0
    : sameFailure
      ? numeric(previous?.consecutiveFailureCount) + 1
      : 1;
  const attemptCount = numeric(previous?.attemptCount) + 1;
  const immediatelyActionable = classification?.immediatelyActionable === true;
  const persistentActionable = !successful && consecutiveFailureCount >= escalationThreshold;
  const actionable = immediatelyActionable || persistentActionable;
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  return {
    schema: "ai-matchlab.autonomous-history-recovery-state.v1",
    dayKey: clean(dayKey),
    firstSeenAt: previous?.firstSeenAt || nowIso,
    lastAttemptAt: nowIso,
    attemptCount,
    consecutiveFailureCount,
    escalationThreshold,
    lastState: state,
    lastReasonKey: reasonKey,
    lastReasons: Array.isArray(classification?.reasons) ? classification.reasons : [],
    retryAction: classification?.retryAction || "retry_next_checkpoint",
    actionable,
    immediatelyActionable,
    persistentActionable,
    repairedAt: state === "repaired" ? nowIso : (previous?.repairedAt || null),
    lastHealthyAt: successful ? nowIso : (previous?.lastHealthyAt || null),
    actions: Array.isArray(actions) ? actions : []
  };
}

function rowProjection(row) {
  return {
    id: clean(row?.id),
    dayKey: clean(row?.dayKey),
    kickoff: clean(row?.kickoff),
    leagueSlug: clean(row?.leagueSlug),
    homeTeam: clean(row?.homeTeam),
    awayTeam: clean(row?.awayTeam),
    scoreHome: Number(row?.scoreHome),
    scoreAway: Number(row?.scoreAway),
    status: clean(row?.status),
    outcome: clean(row?.outcome),
    source: clean(row?.source),
    truthContract: row?.truthContract || null
  };
}

export function historyRowsEquivalent(existingRows = [], candidateRows = []) {
  const left = (Array.isArray(existingRows) ? existingRows : [])
    .map(rowProjection)
    .sort((a, b) => a.id.localeCompare(b.id));
  const right = (Array.isArray(candidateRows) ? candidateRows : [])
    .map(rowProjection)
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(left) === JSON.stringify(right);
}
