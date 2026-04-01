import { getActiveByDay, getStagingByDay } from "../storage/json-db.js";

export function buildFixturesRuntime(mode, dayKey) {
  const rows =
    mode === "active"
      ? getActiveByDay(dayKey)
      : getStagingByDay(dayKey);

  if (mode === "today") {
    return rows.filter(r => r.status === "PRE" || r.status === "LIVE");
  }

  if (mode === "active") {
    return rows.filter(
      r =>
        r.status === "PRE" ||
        r.status === "LIVE" ||
        r.status === "FT" ||
        r.status === "SPECIAL"
    );
  }

  return rows;
}