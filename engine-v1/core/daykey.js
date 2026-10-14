import { ATHENS_TZ } from "../config.js";

export function dayKeyTZ(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${d}`;
}

export function athensDayKey(date = new Date()) {
  return dayKeyTZ(ATHENS_TZ, date);
}

// Admission for live odds collection; safe to run before provider modules load.
export function assertLiveOddsDay(dayKey, today = athensDayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey) || !Number.isFinite(Date.parse(`${dayKey}T12:00:00Z`)) ||
    new Date(`${dayKey}T12:00:00Z`).toISOString().slice(0, 10) !== dayKey || dayKey < today) throw new Error("live_odds_historical_replay_forbidden");
}

export function shiftDay(day, offset) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function athensDayFromKickoff(iso) {
  const d = new Date(iso);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${day}`;
}
