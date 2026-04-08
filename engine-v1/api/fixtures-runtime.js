import { getActiveByDay, getStagingByDay } from "../storage/json-db.js";

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();
  return (
    s === "LIVE" ||
    s === "FIRST_HALF" ||
    s === "SECOND_HALF" ||
    s === "HALF_TIME" ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF_TIME") ||
    s.includes("EXTRA_TIME")
  );
}

function isPreLike(status) {
  return String(status || "").toUpperCase() === "PRE";
}

function isFinalLike(status) {
  return String(status || "").toUpperCase() === "FT";
}

function isSpecialLike(status) {
  return String(status || "").toUpperCase() === "SPECIAL";
}

export function buildFixturesRuntime(mode, dayKey) {
  if (mode === "today") {
    const rows = getStagingByDay(dayKey);
    return rows.filter(r => isPreLike(r.status) || isLiveLike(r.status));
  }

  if (mode === "active") {
    const rows = getActiveByDay(dayKey);
    return rows.filter(
      r =>
        isPreLike(r.status) ||
        isFinalLike(r.status) ||
        isSpecialLike(r.status)
    );
  }

  return getStagingByDay(dayKey);
}