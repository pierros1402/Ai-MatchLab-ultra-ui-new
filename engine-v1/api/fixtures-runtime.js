import { getActiveByDay, getStagingByDay } from "../storage/json-db.js";

function normalizeOperationalState(row) {
  return String(row?.operationalState || "").toUpperCase();
}

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
  const s = String(status || "").toUpperCase();
  return (
    s === "PRE" ||
    s === "SCHEDULED" ||
    s === "STATUS_SCHEDULED" ||
    s === "NOT_STARTED" ||
    s.includes("SCHEDULED") ||
    s.includes("NOT_STARTED")
  );
}

function isFinalLike(status) {
  const s = String(status || "").toUpperCase();
  return (
    s === "FT" ||
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN")
  );
}

function isSpecialLike(status) {
  const s = String(status || "").toUpperCase();
  return (
    s === "SPECIAL" ||
    s.includes("POSTPONED") ||
    s.includes("CANCELED") ||
    s.includes("ABANDONED")
  );
}

function deriveDisplayTodayFromOperationalState(row) {
  const op = normalizeOperationalState(row);

  if (op === "PRE") return true;
  if (op === "LIVE") return true;

  if (op === "STALE_LIVE") return false;
  if (op === "TERMINAL_UNCONFIRMED") return false;
  if (op === "TERMINAL_CONFIRMED") return false;
  if (op === "SPECIAL") return false;

  return null;
}

function deriveDisplayActiveFromOperationalState(row) {
  const op = normalizeOperationalState(row);

  if (op === "PRE") return true;
  if (op === "TERMINAL_CONFIRMED") return true;
  if (op === "SPECIAL") return true;

  if (op === "LIVE") return false;
  if (op === "STALE_LIVE") return false;
  if (op === "TERMINAL_UNCONFIRMED") return false;

  return null;
}

function isDisplayToday(row) {
  const derived = deriveDisplayTodayFromOperationalState(row);
  if (typeof derived === "boolean") return derived;

  if (
    typeof row?.isDisplayPre === "boolean" ||
    typeof row?.isDisplayLive === "boolean"
  ) {
    return !!row?.isDisplayPre || !!row?.isDisplayLive;
  }

  return isPreLike(row?.status) || isLiveLike(row?.status);
}

function isDisplayActive(row) {
  const derived = deriveDisplayActiveFromOperationalState(row);
  if (typeof derived === "boolean") return derived;

  if (
    typeof row?.isDisplayPre === "boolean" ||
    typeof row?.isDisplayFinal === "boolean"
  ) {
    return (
      !!row?.isDisplayPre ||
      !!row?.isDisplayFinal ||
      isSpecialLike(row?.status)
    );
  }

  return (
    isPreLike(row?.status) ||
    isFinalLike(row?.status) ||
    isSpecialLike(row?.status)
  );
}

export function buildFixturesRuntime(mode, dayKey) {
  if (mode === "today") {
    const rows = getStagingByDay(dayKey);

    // ONLY reconciled truth
    const canonical = rows.filter(r => r?.source === "reconciled");

    return canonical.filter(isDisplayToday);
  }

  if (mode === "active") {
    const rows = getActiveByDay(dayKey);

    // ONLY reconciled truth
    const canonical = rows.filter(r => r?.source === "reconciled");

    return canonical.filter(isDisplayActive);
  }

  return getStagingByDay(dayKey);
}