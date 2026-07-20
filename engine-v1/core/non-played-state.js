export const MATCH_STATE_CLASS = Object.freeze({
  PRE_KICKOFF_NON_PLAYED: "PRE_KICKOFF_NON_PLAYED",
  PLAY_INTERRUPTED: "PLAY_INTERRUPTED",
  TEMPORARY_DELAY: "TEMPORARY_DELAY",
  RESULT_INVALIDATED: "RESULT_INVALIDATED",
  PLAYED_FINAL: "PLAYED_FINAL",
  CONFLICT: "CONFLICT",
  UNKNOWN: "UNKNOWN"
});

const PRE_KICKOFF_NON_PLAYED_TOKENS = new Set([
  "STATUS_POSTPONED",
  "POSTPONED",
  "STATUS_CANCELED",
  "STATUS_CANCELLED",
  "CANCELED",
  "CANCELLED",
  "STATUS_NOT_PLAYED",
  "NOT_PLAYED"
]);

const PLAY_INTERRUPTED_TOKENS = new Set([
  "STATUS_ABANDONED",
  "ABANDONED",
  "STATUS_SUSPENDED",
  "SUSPENDED",
  "STATUS_INTERRUPTED",
  "INTERRUPTED"
]);

const TEMPORARY_DELAY_TOKENS = new Set([
  "STATUS_DELAYED",
  "DELAYED"
]);

const RESULT_INVALIDATED_TOKENS = new Set([
  "STATUS_VOID",
  "VOID",
  "STATUS_NO_CONTEST",
  "NO_CONTEST"
]);

const PLAYED_FINAL_TOKENS = new Set([
  "FT",
  "FINAL",
  "FULL_TIME",
  "STATUS_FINAL",
  "STATUS_FULL_TIME",
  "STATUS_FINAL_AET",
  "STATUS_FINAL_PEN",
  "STATUS_FULL_TIME_AET",
  "STATUS_FULL_TIME_PEN",
  "STATUS_AET",
  "STATUS_PEN",
  "AET",
  "PEN",
  "AFTER_EXTRA_TIME",
  "AFTER_PENALTIES"
]);

function cleanToken(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function matchStateTokens(row) {
  if (!row || typeof row !== "object") return [];

  return [
    row.status,
    row.rawStatus,
    row.statusType,
    row.sourceStatus,
    row.sourceStatusType,
    row.providerStatus,
    row.providerStatusType,
    row.statusName
  ]
    .map(cleanToken)
    .filter(Boolean);
}

export function classifyMatchState(row) {
  const tokens = matchStateTokens(row);
  const matchedClasses = [];

  if (tokens.some(token => PRE_KICKOFF_NON_PLAYED_TOKENS.has(token))) {
    matchedClasses.push(MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED);
  }

  if (tokens.some(token => PLAY_INTERRUPTED_TOKENS.has(token))) {
    matchedClasses.push(MATCH_STATE_CLASS.PLAY_INTERRUPTED);
  }

  if (tokens.some(token => TEMPORARY_DELAY_TOKENS.has(token))) {
    matchedClasses.push(MATCH_STATE_CLASS.TEMPORARY_DELAY);
  }

  if (tokens.some(token => RESULT_INVALIDATED_TOKENS.has(token))) {
    matchedClasses.push(MATCH_STATE_CLASS.RESULT_INVALIDATED);
  }

  if (tokens.some(token => PLAYED_FINAL_TOKENS.has(token))) {
    matchedClasses.push(MATCH_STATE_CLASS.PLAYED_FINAL);
  }

  if (matchedClasses.length > 1) {
    return MATCH_STATE_CLASS.CONFLICT;
  }

  return matchedClasses[0] || MATCH_STATE_CLASS.UNKNOWN;
}

export function isPreKickoffNonPlayed(row) {
  return classifyMatchState(row) === MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED;
}

export function hasMatchStateConflict(row) {
  return classifyMatchState(row) === MATCH_STATE_CLASS.CONFLICT;
}

export function verifiedFinalVetoReason(row) {
  switch (classifyMatchState(row)) {
    case MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED:
      return "canonical_pre_kickoff_non_played";
    case MATCH_STATE_CLASS.PLAY_INTERRUPTED:
      return "canonical_play_interrupted";
    case MATCH_STATE_CLASS.TEMPORARY_DELAY:
      return "canonical_temporary_delay";
    case MATCH_STATE_CLASS.RESULT_INVALIDATED:
      return "canonical_result_invalidated";
    case MATCH_STATE_CLASS.CONFLICT:
      return "canonical_status_conflict";
    default:
      return null;
  }
}

export function isVerifiedFinalVetoState(row) {
  return verifiedFinalVetoReason(row) !== null;
}

export function sanitizePreKickoffNonPlayed(row) {
  if (!row || typeof row !== "object" || !isPreKickoffNonPlayed(row)) {
    return row;
  }

  return {
    ...row,
    scoreHome: null,
    scoreAway: null,
    homeScore: Object.prototype.hasOwnProperty.call(row, "homeScore")
      ? null
      : row.homeScore,
    awayScore: Object.prototype.hasOwnProperty.call(row, "awayScore")
      ? null
      : row.awayScore,
    minute: null,
    penalties: null,
    decidedBy: null,
    isDisplayFinal: false
  };
}

function isPresent(value) {
  return value !== null && value !== undefined;
}

export function hasPreKickoffNonPlayedDisplayViolation(row) {
  if (!isPreKickoffNonPlayed(row)) return false;

  return (
    isPresent(row?.scoreHome) ||
    isPresent(row?.scoreAway) ||
    isPresent(row?.homeScore) ||
    isPresent(row?.awayScore) ||
    isPresent(row?.minute) ||
    isPresent(row?.penalties) ||
    isPresent(row?.decidedBy) ||
    row?.isDisplayFinal === true
  );
}
