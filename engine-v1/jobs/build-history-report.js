/**
 * build-history-report.js
 *
 * Derives data/history/<season>.report.json from the season STORE
 * (data/history/<season>.json) — the single source of truth maintained daily
 * by append-finalized-day-to-history.
 *
 * The report used to be written only by the one-shot backfill CLI
 * (rebuild-current-season-history.js), so it froze at the last manual run and
 * accumulated fetch failures that said nothing about what is actually in the
 * store. This job regenerates it from store contents alone: no fetches, fully
 * deterministic, safe to run any time.
 *
 * Usage: node engine-v1/jobs/build-history-report.js [--season 2025-2026]
 * Guardrails: canonicalWrites 0 (writes only data/history/<season>.report.json).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// The store has carried three shapes over time (plain rows array, days array,
// keyed days object) — same tolerance as build-standings-day.
function collectDayBuckets(store) {
  if (Array.isArray(store)) {
    const byDay = new Map();
    for (const row of store) {
      const dayKey = String(row?.dayKey || "");
      if (!dayKey) continue;
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(row);
    }
    return [...byDay.entries()].map(([dayKey, rows]) => ({ dayKey, rows }));
  }

  const rawDays = store?.days;

  if (Array.isArray(rawDays)) {
    return rawDays
      .map(day => ({
        dayKey: String(day?.dayKey || ""),
        rows: Array.isArray(day?.rows) ? day.rows : []
      }))
      .filter(day => !!day.dayKey);
  }

  if (rawDays && typeof rawDays === "object") {
    return Object.entries(rawDays)
      .map(([dayKey, day]) => ({
        dayKey: String(dayKey),
        rows: Array.isArray(day?.rows) ? day.rows : []
      }))
      .filter(day => !!day.dayKey);
  }

  return [];
}

function addDays(dayKey, days) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, "0"),
    String(dt.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function buildHistoryReport(season = currentSeason()) {
  const storePath = resolveDataPath("history", `${season}.json`);
  const reportPath = resolveDataPath("history", `${season}.report.json`);

  const store = readJsonSafe(storePath, null);
  if (!store) {
    return { ok: false, reason: "store_missing", season, storePath };
  }

  const buckets = collectDayBuckets(store)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const byDay = {};
  const byLeague = {};
  let totalMatches = 0;

  for (const { dayKey, rows } of buckets) {
    byDay[dayKey] = rows.length;
    totalMatches += rows.length;
    for (const row of rows) {
      const slug = String(row?.leagueSlug || "unknown");
      byLeague[slug] = (byLeague[slug] || 0) + 1;
    }
  }

  const daysWithMatches = buckets.filter(b => b.rows.length > 0);
  const from = daysWithMatches[0]?.dayKey || null;
  const to = daysWithMatches[daysWithMatches.length - 1]?.dayKey || null;

  // Days inside [from, to] with no stored matches — the actual backfill gaps.
  const missingDays = [];
  if (from && to) {
    const present = new Set(daysWithMatches.map(b => b.dayKey));
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!present.has(day)) missingDays.push(day);
    }
  }

  const report = {
    ok: true,
    season,
    source: "derived-from-store",
    generatedAt: new Date().toISOString(),
    from,
    to,
    daysCovered: buckets.length,
    daysWithMatches: daysWithMatches.length,
    missingDayCount: missingDays.length,
    missingDays,
    totalMatches,
    leaguesCovered: Object.keys(byLeague).length,
    lastCompletedDay: to,
    byDay,
    byLeague
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return {
    ok: true,
    season,
    reportPath,
    from,
    to,
    daysWithMatches: daysWithMatches.length,
    missingDayCount: missingDays.length,
    totalMatches,
    leaguesCovered: report.leaguesCovered
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const seasonArg = process.argv.find(a => a.startsWith("--season="))?.split("=")[1]
    || (process.argv.includes("--season") ? process.argv[process.argv.indexOf("--season") + 1] : null);
  const r = buildHistoryReport(seasonArg || undefined);
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0 } }, null, 2));
}
