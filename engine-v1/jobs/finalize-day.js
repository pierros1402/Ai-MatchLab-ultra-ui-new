import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";

export function finalizeDayIfSafe(dayKey) {
  const rows = getFixturesByDay(dayKey);

  if (!rows.length) {
    return { ok: false, reason: "no_rows", dayKey };
  }

  const liveExists = rows.some(r => r.status === "LIVE");

  if (liveExists) {
    return {
      ok: false,
      reason: "live_exists",
      dayKey,
      liveCount: rows.filter(r => r.status === "LIVE").length
    };
  }

  const hasPre = rows.some(r => r.status === "PRE");
  const hasOnlySpecial = rows.every(
    r => r.status === "SPECIAL" || r.status === "FT"
  );

  if (hasPre && !hasOnlySpecial) {
    return {
      ok: false,
      reason: "pre_exists",
      dayKey,
      preCount: rows.filter(r => r.status === "PRE").length
    };
  }

  markDayFinal(dayKey);

  return {
    ok: true,
    dayKey,
    finalized: rows.length
  };
}