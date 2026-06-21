/**
 * export-odds-snapshot-day.js
 *
 * Writes the odds part of the deploy artifact: data/deploy-snapshots/{day}/odds.json
 * from odds memory (real bookmaker market line + drift + our AI assessment).
 *
 * This is what gets committed so the deployed UI can read the odds without any
 * live odds API. It is deliberately a SEPARATE, small file so odds refreshes
 * (every 8h, hourly near kickoff) only touch odds.json — keeping commits small
 * and letting material-change gating skip no-op deploys.
 *
 * Usage: node engine-v1/jobs/export-odds-snapshot-day.js [YYYY-MM-DD]
 */

import fs from "fs";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { getOddsForDay } from "../storage/odds-memory-db.js";

// Hash only the meaningful odds content (not timestamps), so a re-export with no
// real change leaves the file byte-identical → no git diff → no wasted deploy.
function contentHash(matches) {
  const stable = matches.map(m => ({
    matchId: m.matchId, leagueSlug: m.leagueSlug, competition: m.competition,
    home: m.home, away: m.away, dayKey: m.dayKey, kickoffUtc: m.kickoffUtc || m.kickoffLocal,
    market: m.market, ai: m.aiAssessment?.odds || null
  }));
  return crypto.createHash("sha1").update(JSON.stringify(stable)).digest("hex");
}

export function exportOddsSnapshotDay(dayKey = athensDayKey()) {
  const day = getOddsForDay(dayKey);
  const dir = resolveDataPath("deploy-snapshots", dayKey);
  ensureDir(dir);

  const file = resolveDataPath("deploy-snapshots", dayKey, "odds.json");
  const hash = contentHash(day.matches);

  // Skip rewrite if nothing material changed (keeps deploys few).
  try {
    const existing = JSON.parse(fs.readFileSync(file, "utf8"));
    if (existing.hash === hash) {
      return { ok: true, dayKey, count: day.count, file, changed: false };
    }
  } catch { /* no existing file */ }

  const payload = {
    ok: true,
    date: dayKey,
    generatedAt: new Date().toISOString(),
    source: "autonomous-odds-capture",
    hash,
    count: day.count,
    matches: day.matches
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return { ok: true, dayKey, count: day.count, file, changed: true };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = (process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))) || athensDayKey();
  const r = exportOddsSnapshotDay(arg);
  console.log(JSON.stringify({ ...r, guarantees: { canonicalWrites: 0, productionWrite: false } }, null, 2));
}
