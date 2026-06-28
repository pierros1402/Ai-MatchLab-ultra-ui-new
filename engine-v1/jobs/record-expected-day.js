/**
 * record-expected-day.js
 *
 * Snapshot the scheduled matches for a given day (from fixtures-all.json) into
 * data/expected-matches/{date}.json before they kick off.  Run at the start of
 * each daily cycle so verify-results-day.js can later compare what we expected
 * vs what was actually collected.
 *
 * This is the "morning record" step in the expected-vs-actual loop:
 *   1. Morning  → record-expected-day.js  (what is scheduled)
 *   2. Night    → accumulate-results-day.js (FT results land in league-memory)
 *   3. Night    → verify-results-day.js   (what did we actually collect?)
 *
 * Output: data/expected-matches/{date}.json
 *   { dayKey, recordedAt, source, matchCount, matches: [{matchId,home,away,leagueSlug,kickoffUtc}] }
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { athensDayKey } from "../core/daykey.js";

const OUTPUT_DIR = resolveDataPath("expected-matches");

function log(...a) { console.log("[record-expected]", ...a); }

/**
 * Read the fixtures-all.json snapshot, trying today then yesterday as fallback.
 * Returns null if neither exists.
 */
function readFixturesAll(referenceDate) {
  // Try snapshot dir for referenceDate first, then today, then yesterday
  const candidates = [];
  // Add the reference date itself
  candidates.push(resolveDataPath("deploy-snapshots", referenceDate, "fixtures-all.json"));
  // Then today
  const today = athensDayKey();
  if (today !== referenceDate) {
    candidates.push(resolveDataPath("deploy-snapshots", today, "fixtures-all.json"));
  }
  // Then yesterday
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yesterday = yest.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  candidates.push(resolveDataPath("deploy-snapshots", yesterday, "fixtures-all.json"));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { /* try next */ }
  }
  return null;
}

export function recordExpectedDay(dayKey) {
  const date = dayKey || athensDayKey();

  ensureDir(OUTPUT_DIR);
  const outFile = path.join(OUTPUT_DIR, `${date}.json`);

  // Don't re-record if already done for this date (idempotent).
  if (fs.existsSync(outFile)) {
    const existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
    log("already recorded", { date, matchCount: existing.matchCount });
    return { ok: true, date, matchCount: existing.matchCount, skipped: true };
  }

  const snap = readFixturesAll(date);
  if (!snap) {
    log("no fixtures-all.json found — nothing to record", { date });
    return { ok: false, date, error: "no_fixtures_all" };
  }

  const matches = (snap.matches || [])
    .filter(m => m.dayKey === date)
    .map(m => ({
      matchId:    String(m.id || m.matchId || ""),
      home:       m.home || m.homeTeam || "",
      away:       m.away || m.awayTeam || "",
      leagueSlug: m.leagueSlug || "",
      leagueName: m.leagueName || m.competition || "",
      kickoffUtc: m.kickoffUtc || "",
    }))
    .filter(m => m.matchId && m.home && m.away);

  const record = {
    dayKey:      date,
    recordedAt:  new Date().toISOString(),
    source:      "fixtures-all",
    matchCount:  matches.length,
    matches,
  };

  fs.writeFileSync(outFile, JSON.stringify(record, null, 2), "utf8");
  log("recorded", { date, matchCount: matches.length });

  return { ok: true, date, matchCount: matches.length, skipped: false };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const result = recordExpectedDay(arg);
  console.log(JSON.stringify(result, null, 2));
}
