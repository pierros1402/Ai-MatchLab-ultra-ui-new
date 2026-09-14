import { sameTeamName } from "./fixture-dedup.js";
import { classifyMatchState, MATCH_STATE_CLASS } from "./non-played-state.js";

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
  "verified_final_day_mismatch",
  "certified_history_canonical_status_conflict",
  "certified_history_duplicate_canonical_id",
  "certified_history_duplicate_history_id",
  "certified_history_extra_row",
  "certified_history_day_mismatch",
  "certified_history_score_mismatch",
  "certified_history_team_mismatch"
]);

const REQUIRED_HISTORY_TRUTH_FLAGS = Object.freeze([
  "canonicalIdExact",
  "athensDayExact",
  "orderedTeamPairMatched",
  "canonicalPlayedTerminal",
  "exactScoreParity",
  "verifiedFinalTruth",
  "nullScoreCoercionForbidden"
]);

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function strictScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function reasonCounts(errors = []) {
  const counts = {};
  for (const row of errors) {
    const reason = clean(row?.reason) || "unknown_certified_history_error";
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function teamsMatch(slug, left, right) {
  return (
    sameTeamName(slug, left, right) ||
    sameTeamName(slug, right, left)
  );
}

export function validateCertifiedHistoryAgainstCanonical({
  dayKey,
  canonicalRows = [],
  historyRows = []
} = {}) {
  const targetDay = clean(dayKey);
  const errors = [];
  const canonicalFinalById = new Map();
  const historyById = new Map();

  for (const row of Array.isArray(canonicalRows) ? canonicalRows : []) {
    const state = classifyMatchState(row);
    const id = clean(row?.canonicalId || row?.matchId);

    if (state === MATCH_STATE_CLASS.CONFLICT) {
      errors.push({
        reason: "certified_history_canonical_status_conflict",
        matchId: id || null,
        integrity: true
      });
      continue;
    }

    if (state !== MATCH_STATE_CLASS.PLAYED_FINAL) continue;

    if (!id) {
      errors.push({ reason: "certified_history_missing_canonical_id", recoverable: true });
      continue;
    }

    if (canonicalFinalById.has(id)) {
      errors.push({
        reason: "certified_history_duplicate_canonical_id",
        matchId: id,
        integrity: true
      });
      continue;
    }

    canonicalFinalById.set(id, row);
  }

  for (const row of Array.isArray(historyRows) ? historyRows : []) {
    const id = clean(row?.id);
    if (!id) {
      errors.push({ reason: "certified_history_missing_history_id", recoverable: true });
      continue;
    }
    if (historyById.has(id)) {
      errors.push({
        reason: "certified_history_duplicate_history_id",
        matchId: id,
        integrity: true
      });
      continue;
    }
    historyById.set(id, row);
  }

  for (const [id, canonical] of canonicalFinalById) {
    const history = historyById.get(id);
    if (!history) {
      errors.push({
        reason: "certified_history_missing_row",
        matchId: id,
        recoverable: true
      });
      continue;
    }

    if (clean(history?.dayKey) !== targetDay) {
      errors.push({
        reason: "certified_history_day_mismatch",
        matchId: id,
        actualDay: clean(history?.dayKey) || null,
        integrity: true
      });
    }

    const canonicalHome = strictScore(canonical?.scoreHome ?? canonical?.homeScore);
    const canonicalAway = strictScore(canonical?.scoreAway ?? canonical?.awayScore);
    const historyHome = strictScore(history?.scoreHome);
    const historyAway = strictScore(history?.scoreAway);
    if (
      canonicalHome === null ||
      canonicalAway === null ||
      historyHome === null ||
      historyAway === null
    ) {
      errors.push({
        reason: "certified_history_numeric_score_required",
        matchId: id,
        recoverable: true
      });
    } else if (
      canonicalHome !== historyHome ||
      canonicalAway !== historyAway
    ) {
      errors.push({
        reason: "certified_history_score_mismatch",
        matchId: id,
        canonicalScore: `${canonicalHome}-${canonicalAway}`,
        historyScore: `${historyHome}-${historyAway}`,
        integrity: true
      });
    }

    const slug = clean(canonical?.leagueSlug || history?.leagueSlug);
    if (
      !teamsMatch(slug, canonical?.homeTeam, history?.homeTeam) ||
      !teamsMatch(slug, canonical?.awayTeam, history?.awayTeam)
    ) {
      errors.push({
        reason: "certified_history_team_mismatch",
        matchId: id,
        integrity: true
      });
    }

    const truthContract = history?.truthContract || {};
    const missingFlags = REQUIRED_HISTORY_TRUTH_FLAGS.filter(flag => truthContract?.[flag] !== true);
    if (missingFlags.length) {
      errors.push({
        reason: "certified_history_truth_contract_incomplete",
        matchId: id,
        missingFlags,
        recoverable: true
      });
    }
  }

  for (const [id] of historyById) {
    if (!canonicalFinalById.has(id)) {
      errors.push({
        reason: "certified_history_extra_row",
        matchId: id,
        integrity: true
      });
    }
  }

  const integrityBlocked = errors.some(row => row?.integrity === true);
  const recoverable = !integrityBlocked;
  const ok =
    errors.length === 0 &&
    canonicalFinalById.size > 0 &&
    historyById.size === canonicalFinalById.size;

  return {
    ok,
    certified: ok,
    dayKey: targetDay,
    canonicalPlayedFinalCount: canonicalFinalById.size,
    historyRowCount: historyById.size,
    integrityBlocked,
    recoverable,
    reasonCounts: reasonCounts(errors),
    errors
  };
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
  certifiedHistory = null,
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

  if (certifiedHistory?.ok === true) {
    return {
      state: "healthy",
      reasons: [],
      retryAction: "none",
      immediatelyActionable: false,
      historyChanged: false,
      certifiedHistoryMemory: true
    };
  }

  if (certifiedHistory?.integrityBlocked === true) {
    const reasons = Object.keys(certifiedHistory?.reasonCounts || {}).sort();
    return {
      state: "blocked_integrity",
      reasons: reasons.length ? reasons : ["certified_history_integrity_mismatch"],
      reasonCounts: certifiedHistory?.reasonCounts || {},
      retryAction: "human_truth_review",
      immediatelyActionable: true,
      historyChanged: false,
      certifiedHistoryMemory: false
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
