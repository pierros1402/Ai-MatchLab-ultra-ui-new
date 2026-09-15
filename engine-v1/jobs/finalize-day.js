import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";
import { getObservationsByMatchId } from "../storage/observations-db.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import {
  OPERATIONAL_MATCH_STATE,
  classifyOperationalMatchState,
  isPlayedFinal
} from "../core/non-played-state.js";

const NO_DRAW_COMPETITIONS = new Set([
  "jpn.1"
]);

function isNoDrawCompetition(slug) {
  return NO_DRAW_COMPETITIONS.has(String(slug || "").trim());
}

function strictScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (
      typeof value === "string" &&
      value.trim() === ""
    )
  ) {
    return null;
  }

  const score = Number(value);

  return (
    Number.isInteger(score) &&
    score >= 0
  )
    ? score
    : null;
}

function hasPenaltyResolution(row) {
  const homePens =
    strictScore(row?.penalties?.home);

  const awayPens =
    strictScore(row?.penalties?.away);

  const hasStructuredPens =
    homePens !== null &&
    awayPens !== null;

  const decidedByPens =
    String(
      row?.decidedBy || ""
    ).toLowerCase() === "pens";

  return (
    hasStructuredPens ||
    decidedByPens
  );
}

export function classifyFinalizationState(row) {
  return classifyOperationalMatchState(row);
}

function isOperationallyBlockingLive(row) {
  return (
    classifyFinalizationState(row) ===
    OPERATIONAL_MATCH_STATE.LIVE
  );
}

function isOperationallyBlockingPre(row) {
  return (
    classifyFinalizationState(row) ===
    OPERATIONAL_MATCH_STATE.SCHEDULED
  );
}

function isOperationallyTerminal(row) {
  return (
    classifyFinalizationState(row) ===
    OPERATIONAL_MATCH_STATE.PLAYED_TERMINAL
  );
}

function isOperationallySpecial(row) {
  return (
    classifyFinalizationState(row) ===
    OPERATIONAL_MATCH_STATE.NON_PLAYED_TERMINAL
  );
}

function isMissingMandatoryResolution(row) {
  if (!row) return false;

  if (
    !isNoDrawCompetition(
      row.leagueSlug
    )
  ) {
    return false;
  }

  if (!isOperationallyTerminal(row)) {
    return false;
  }

  const home =
    strictScore(row.scoreHome);

  const away =
    strictScore(row.scoreAway);

  if (
    home === null ||
    away === null
  ) {
    return true;
  }

  if (home !== away) {
    return false;
  }

  return !hasPenaltyResolution(row);
}

function sameDayObservation(obs, dayKey) {
  const actual = String(obs?.actualDay || "");
  const requested = String(obs?.requestedDay || "");
  return actual === String(dayKey) || requested === String(dayKey);
}

export function hasStablePlayedFinalObservation(
  row,
  dayKey,
  observations = []
) {
  const obs =
    Array.isArray(observations)
      ? observations
      : [];

  if (!obs.length) {
    return false;
  }

  const sameDayObs =
    obs.filter(
      observation =>
        sameDayObservation(
          observation,
          dayKey
        )
    );

  const pool =
    sameDayObs.length
      ? sameDayObs
      : obs;

  const terminalObs =
    pool.filter(
      observation =>
        isPlayedFinal(observation)
    );

  if (!terminalObs.length) {
    return false;
  }

  const last =
    terminalObs[
      terminalObs.length - 1
    ];

  const rowHome =
    strictScore(row?.scoreHome);

  const rowAway =
    strictScore(row?.scoreAway);

  const lastHome =
    strictScore(last?.scoreHome);

  const lastAway =
    strictScore(last?.scoreAway);

  if (
    rowHome === null ||
    rowAway === null ||
    lastHome === null ||
    lastAway === null
  ) {
    return false;
  }

  if (
    rowHome !== lastHome ||
    rowAway !== lastAway
  ) {
    return false;
  }

  const conflictingTerminal =
    terminalObs.some(
      observation => {
        const home =
          strictScore(
            observation?.scoreHome
          );

        const away =
          strictScore(
            observation?.scoreAway
          );

        if (
          home === null ||
          away === null
        ) {
          return true;
        }

        return (
          home !== rowHome ||
          away !== rowAway
        );
      }
    );

  return !conflictingTerminal;
}

function hasStableTerminalObservation(
  row,
  dayKey
) {
  return hasStablePlayedFinalObservation(
    row,
    dayKey,
    getObservationsByMatchId(
      row.matchId
    ) || []
  );
}

function verifiedSettlementDelegation(dayKey) {
  return {
    ok: true,
    skipped: true,
    dayKey,
    reason:
      "dedicated_verified_final_settlement_pipeline",
    productionWrite: false,
    requiresVerifiedFinalTruth: true,
    legacyFixtureScoreSettlementDisabled: true
  };
}

export async function settleValueResultsIfPossible(
  dayKey
) {
  return verifiedSettlementDelegation(
    dayKey
  );
}

export async function finalizeDayIfSafe(dayKey) {
  const rows = getFixturesByDay(dayKey);

  if (!rows.length) {
    return { ok: false, reason: "no_rows", dayKey };
  }

  const liveMatches = rows.filter(isOperationallyBlockingLive);

  if (liveMatches.length) {
    return {
      ok: false,
      reason: "live_exists",
      dayKey,
      liveCount: liveMatches.length,
      matchIds: liveMatches.map(r => r.matchId)
    };
  }

  const preMatches = rows.filter(isOperationallyBlockingPre);
  const blockingPre = preMatches.filter(r => !isOperationallySpecial(r));

  if (blockingPre.length) {
    return {
      ok: false,
      reason: "pre_exists",
      dayKey,
      preCount: blockingPre.length,
      matchIds: blockingPre.map(r => r.matchId)
    };
  }

  const invalid = rows.filter(
    r => !isOperationallyTerminal(r) && !isOperationallySpecial(r)
  );

  if (invalid.length) {
    return {
      ok: false,
      reason: "non_terminal_remaining",
      dayKey,
      count: invalid.length,
      matchIds: invalid.map(r => r.matchId)
    };
  }

  const unstableTerminal = rows.filter(
    r => isOperationallyTerminal(r) && !hasStableTerminalObservation(r, dayKey)
  );

  if (unstableTerminal.length) {
    return {
      ok: false,
      reason: "unstable_terminal_scores",
      dayKey,
      count: unstableTerminal.length,
      matchIds: unstableTerminal.map(r => r.matchId)
    };
  }

  const unresolvedMandatoryResolution = rows.filter(isMissingMandatoryResolution);

  if (unresolvedMandatoryResolution.length) {
    return {
      ok: false,
      reason: "missing_mandatory_resolution",
      dayKey,
      count: unresolvedMandatoryResolution.length,
      matchIds: unresolvedMandatoryResolution.map(r => r.matchId)
    };
  }

  markDayFinal(dayKey);
  await appendFinalizedDayToHistory(dayKey);
  const valueResolution =
    verifiedSettlementDelegation(
      dayKey
    );

  return {
    ok: true,
    dayKey,
    finalized: rows.length,
    valueResolution
  };
}