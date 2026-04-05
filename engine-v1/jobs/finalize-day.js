import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF") ||
    s.includes("EXTRA_TIME")
  );
}

function isPreLike(status) {
  const s = String(status || "").toUpperCase();

  return (
    s === "PRE" ||
    s.includes("SCHEDULED")
  );
}

function isTerminal(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("FT") ||
    s.includes("FINAL") ||
    s.includes("COMPLETE")
  );
}

function isSpecial(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("POSTPONED") ||
    s.includes("CANCELED") ||
    s.includes("ABANDONED") ||
    s === "SPECIAL"
  );
}

export function finalizeDayIfSafe(dayKey) {
  const rows = getFixturesByDay(dayKey);

  if (!rows.length) {
    return { ok: false, reason: "no_rows", dayKey };
  }

  const liveMatches = rows.filter(r => isLiveLike(r.status));

  if (liveMatches.length) {
    return {
      ok: false,
      reason: "live_exists",
      dayKey,
      liveCount: liveMatches.length
    };
  }

  const preMatches = rows.filter(r => isPreLike(r.status));

  const blockingPre = preMatches.filter(
    r => !isSpecial(r.status)
  );

  if (blockingPre.length) {
    return {
      ok: false,
      reason: "pre_exists",
      dayKey,
      preCount: blockingPre.length
    };
  }

  const invalid = rows.filter(
    r => !isTerminal(r.status) && !isSpecial(r.status)
  );

  if (invalid.length) {
    return {
      ok: false,
      reason: "non_terminal_remaining",
      dayKey,
      count: invalid.length
    };
  }

  markDayFinal(dayKey);
  appendFinalizedDayToHistory(dayKey);

  return {
    ok: true,
    dayKey,
    finalized: rows.length
  };
}