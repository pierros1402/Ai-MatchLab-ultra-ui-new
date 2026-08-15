import {
  MATCH_STATE_CLASS,
  classifyMatchState,
  hasProtectedNonPlayedSignal
} from "./non-played-state.js";

const STATUS_BUNDLE_FIELDS = Object.freeze([
  "status",
  "statusType",
  "rawStatus",
  "sourceStatus",
  "sourceStatusType",
  "providerStatus",
  "providerStatusType",
  "statusName",
  "operationalState",
  "state",
  "finalized",
  "minute",
  "scoreHome",
  "scoreAway",
  "homeScore",
  "awayScore",
  "finalScore",
  "penalties",
  "decidedBy",
  "isDisplayFinal",
  "authoritativeTerminalWriteback",
  "resultSource",
  "statusCorrection",
  "resultsTruthStatusTransition"
]);

const STATUS_BUNDLE_FIELD_SET = new Set(STATUS_BUNDLE_FIELDS);

const OBSERVATION_METADATA_FIELDS = Object.freeze([
  "providerLeagueSlug",
  "fetchedDayKey",
  "lastSeenAt"
]);

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function hasOwn(row, key) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, key);
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function scorePair(row) {
  const home = strictScore(
    row?.scoreHome ??
    row?.homeScore ??
    row?.finalScore?.homeScore ??
    row?.finalScore?.home
  );
  const away = strictScore(
    row?.scoreAway ??
    row?.awayScore ??
    row?.finalScore?.awayScore ??
    row?.finalScore?.away
  );
  return home === null || away === null ? null : { home, away };
}

function sameScore(left, right) {
  const a = scorePair(left);
  const b = scorePair(right);
  if (!a || !b) return true;
  return a.home === b.home && a.away === b.away;
}

function authoritativeWriteback(row) {
  const value = row?.authoritativeTerminalWriteback;
  return value && typeof value === "object"
    ? value
    : null;
}

function authoritativeObservationScore(row) {
  return scorePair(authoritativeWriteback(row)?.observation);
}

function replaceStatusBundle(base, source) {
  const out = { ...(base || {}) };

  for (const key of STATUS_BUNDLE_FIELDS) {
    delete out[key];
  }

  for (const key of STATUS_BUNDLE_FIELDS) {
    if (hasOwn(source, key)) {
      out[key] = source[key];
    }
  }

  return out;
}

function copyObservationMetadata(base, incoming) {
  const out = { ...(base || {}) };
  for (const key of OBSERVATION_METADATA_FIELDS) {
    if (meaningful(incoming?.[key])) out[key] = incoming[key];
  }
  return out;
}

export function isCanonicalStatusBundleField(key) {
  return STATUS_BUNDLE_FIELD_SET.has(String(key || ""));
}

export function mergeMonotonicStatusObservation(previous, incoming) {
  const base = copyObservationMetadata(previous, incoming);
  const previousState = classifyMatchState(previous);
  const incomingState = classifyMatchState(incoming);
  const previousWriteback = authoritativeWriteback(previous);
  const previousHasProtectedTerminal =
    previousState === MATCH_STATE_CLASS.PLAYED_FINAL ||
    Boolean(previousWriteback);

  // Trusted terminal truth is monotonic. A later PRE/SCHEDULED/LIVE/UNKNOWN
  // observation may refresh metadata, but cannot regress the terminal bundle.
  if (previousHasProtectedTerminal && incomingState !== MATCH_STATE_CLASS.PLAYED_FINAL) {
    return base;
  }

  // Generic refresh is not an authorized final-score revision path. If both
  // observations are terminal but disagree on score, preserve the old truth.
  if (
    previousHasProtectedTerminal &&
    incomingState === MATCH_STATE_CLASS.PLAYED_FINAL &&
    !sameScore(previous, incoming)
  ) {
    return base;
  }

  // Explicit postponed/cancelled/interrupted/delayed/void evidence is a veto
  // here. Dedicated verified decision paths may change those states separately.
  if (hasProtectedNonPlayedSignal(previous)) {
    return base;
  }

  // Never persist a provider observation whose own state contract conflicts.
  if (incomingState === MATCH_STATE_CLASS.CONFLICT) {
    return base;
  }

  let source = incoming || {};
  if (
    previousWriteback &&
    incomingState === MATCH_STATE_CLASS.PLAYED_FINAL &&
    !hasOwn(source, "authoritativeTerminalWriteback")
  ) {
    source = {
      ...source,
      authoritativeTerminalWriteback: previousWriteback
    };
  }

  return replaceStatusBundle(base, source);
}

export function mergeDuplicateCanonicalStatus(base, winner, loser) {
  const winnerState = classifyMatchState(winner);
  const loserState = classifyMatchState(loser);
  const winnerWriteback = authoritativeWriteback(winner);

  let stateSource = winner;

  if (winnerState === MATCH_STATE_CLASS.PLAYED_FINAL) {
    stateSource = winner;
  } else if (
    loserState === MATCH_STATE_CLASS.PLAYED_FINAL &&
    !hasProtectedNonPlayedSignal(winner)
  ) {
    if (winnerWriteback) {
      const writebackScore = authoritativeObservationScore(winner);
      const loserScore = scorePair(loser);
      if (
        writebackScore &&
        loserScore &&
        (writebackScore.home !== loserScore.home || writebackScore.away !== loserScore.away)
      ) {
        // Conflicting terminal evidence must remain visible to the write-boundary
        // guard; do not silently choose one score.
        stateSource = winner;
      } else {
        stateSource = hasOwn(loser, "authoritativeTerminalWriteback")
          ? loser
          : { ...loser, authoritativeTerminalWriteback: winnerWriteback };
      }
    } else {
      stateSource = loser;
    }
  } else if (winnerWriteback) {
    // A contradictory winner carrying authoritative terminal evidence must not
    // be demoted to the scheduled loser. Leave it for verified repair / guard.
    stateSource = winner;
  }

  return replaceStatusBundle(base, stateSource);
}

export function shouldAttemptResultsTruthFinal(row) {
  if (hasProtectedNonPlayedSignal(row)) return false;
  return classifyMatchState(row) !== MATCH_STATE_CLASS.PLAYED_FINAL;
}

export function projectTrustedResultsTruthFinal(
  row,
  result,
  { resultSource = "league-memory" } = {}
) {
  if (!shouldAttemptResultsTruthFinal(row)) return row;

  const resultScore = scorePair(result);
  if (!resultScore) return row;

  const writeback = authoritativeWriteback(row);
  const writebackScore = authoritativeObservationScore(row);
  if (
    writebackScore &&
    (writebackScore.home !== resultScore.home || writebackScore.away !== resultScore.away)
  ) {
    return row;
  }

  const previousStatusContract = {};
  for (const key of STATUS_BUNDLE_FIELDS) {
    if (hasOwn(row, key)) previousStatusContract[key] = row[key];
  }

  const source = {
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    scoreHome: resultScore.home,
    scoreAway: resultScore.away,
    isDisplayFinal: true,
    resultSource,
    resultsTruthStatusTransition: {
      schema: "ai-matchlab.results-truth-status-transition.v1",
      reason: "verified_unique_result_truth",
      previousStatusContract
    }
  };

  if (hasOwn(row, "homeScore")) source.homeScore = resultScore.home;
  if (hasOwn(row, "awayScore")) source.awayScore = resultScore.away;
  if (writeback) source.authoritativeTerminalWriteback = writeback;

  return replaceStatusBundle(row, source);
}
