/**
 * backfill-historical-results.js
 *
 * One-shot (re-runnable, idempotent) historical results backfill.
 *
 * Sources:
 *   - football-data.co.uk  — free CSV downloads, ~20 European leagues, goes
 *     back to the 1990s.  Covers 5 seasons (2021-22 → 2025-26) per league.
 *     URL: https://www.football-data.co.uk/mmz4281/{season}/{code}.csv
 *
 * Design:
 *   - Never overwrite results that the daily accumulator already wrote (same
 *     matchId check inside recordMatchResult is idempotent).
 *   - Tracks progress in data/backfill-progress.json so interrupted runs
 *     resume cleanly.  Each {slug, season} pair is recorded once complete.
 *   - Cups and continental competitions: NOT backfilled here (no history
 *     needed per product decision; daily accumulator handles current season).
 *   - Non-European leagues (South America, Asia, Africa): daily accumulator
 *     will build history naturally.  A future Soccerway/WorldFootball source
 *     can be wired in here as a second block.
 *
 * Usage:
 *   node engine-v1/jobs/backfill-historical-results.js
 *   node engine-v1/jobs/backfill-historical-results.js --seasons 3  (last 3 seasons)
 *   node engine-v1/jobs/backfill-historical-results.js --slug eng.1 (one league)
 *
 * Guardrails: canonicalWrites 0 (writes only to league-memory/results).
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";

const PROGRESS_FILE = resolveDataPath("backfill-progress.json");
const DELAY_MS = 800; // polite delay between requests

// ── football-data.co.uk slug → code mapping ─────────────────────────────────
// Season format for URL: "2526" = 2025-26, "2425" = 2024-25, etc.
// Source: https://www.football-data.co.uk/data.php
const FD_MAP = {
  "eng.1": "E0",  "eng.2": "E1",  "eng.3": "E2",   "eng.4": "E3",
  "ger.1": "D1",  "ger.2": "D2",
  "esp.1": "SP1", "esp.2": "SP2",
  "ita.1": "I1",  "ita.2": "I2",
  "fra.1": "F1",  "fra.2": "F2",
  "ned.1": "N1",
  "bel.1": "B1",
  "por.1": "P1",
  "tur.1": "T1",
  "gre.1": "G1",
  "sco.1": "SC0", "sco.2": "SC1",
};

// Build list of seasons to backfill (most recent first).
// Format: { code: "2526", label: "2025-26", start: 2025 }
function buildSeasons(count = 5) {
  const now = new Date();
  // Current season: if before July, season started last year.
  const curStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const seasons = [];
  for (let i = 0; i < count; i++) {
    const y = curStart - i;
    const code = `${String(y).slice(2)}${String(y + 1).slice(2)}`;
    seasons.push({ code, label: `${y}-${y + 1}`, start: y });
  }
  return seasons;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchCsv(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (research bot; football data analysis)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

/**
 * Parse football-data.co.uk CSV.
 * Relevant columns: Date, HomeTeam, AwayTeam, FTHG (full-time home goals),
 * FTAG (full-time away goals).  Date format: DD/MM/YY or DD/MM/YYYY.
 */
function parseFdCsv(text, slug, seasonLabel) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const col = name => headers.indexOf(name);

  const iDate  = col("Date");
  const iHome  = col("HomeTeam");
  const iAway  = col("AwayTeam");
  const iFTHG  = col("FTHG");
  const iFTAG  = col("FTAG");

  if (iDate < 0 || iHome < 0 || iAway < 0 || iFTHG < 0 || iFTAG < 0) return [];

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const rawDate = parts[iDate]?.trim();
    const home    = parts[iHome]?.trim();
    const away    = parts[iAway]?.trim();
    const fthg    = parseInt(parts[iFTHG], 10);
    const ftag    = parseInt(parts[iFTAG], 10);
    if (!rawDate || !home || !away || isNaN(fthg) || isNaN(ftag)) continue;

    // Parse DD/MM/YY or DD/MM/YYYY
    const dateParts = rawDate.split("/");
    if (dateParts.length !== 3) continue;
    let [dd, mm, yy] = dateParts;
    if (yy.length === 2) yy = (parseInt(yy, 10) < 50 ? "20" : "19") + yy;
    const isoDate = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) continue;

    // Build a stable matchId from slug + date + teams
    const matchId = `fd_${slug}_${isoDate}_${home.replace(/\s+/g, "")}_${away.replace(/\s+/g, "")}`.toLowerCase().replace(/[^a-z0-9_]/g, "");

    results.push({
      matchId,
      home,
      away,
      scoreHome: fthg,
      scoreAway: ftag,
      kickoffUtc: `${isoDate}T15:00:00Z`,  // FD doesn't have kickoff time
    });
  }
  return results;
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return { completed: [] }; }
}
function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), "utf8");
}

function log(...a) { console.log("[backfill]", ...a); }

export async function backfillHistoricalResults(options = {}) {
  const seasonCount = options.seasons || 5;
  const slugFilter  = options.slug    || null;
  const seasons     = buildSeasons(seasonCount);

  ensureDir(resolveDataPath("league-memory", "results"));

  const progress = loadProgress();
  const completedSet = new Set(progress.completed || []);

  const slugs = slugFilter
    ? [slugFilter].filter(s => FD_MAP[s])
    : Object.keys(FD_MAP);

  const stats = { fetched: 0, skipped: 0, stored: 0, errors: 0 };

  for (const slug of slugs) {
    const fdCode = FD_MAP[slug];
    for (const season of seasons) {
      const key = `${slug}:${season.label}`;
      if (completedSet.has(key)) {
        log(`skip (done) ${key}`);
        stats.skipped++;
        continue;
      }

      const url = `https://www.football-data.co.uk/mmz4281/${season.code}/${fdCode}.csv`;
      log(`fetch ${key}  →  ${url}`);
      const csv = await fetchCsv(url);

      if (!csv || csv.length < 100) {
        // Season not available yet (future season or data not uploaded)
        log(`  → no data (${csv?.length || 0} bytes)`);
        stats.errors++;
        await sleep(DELAY_MS);
        continue;
      }

      stats.fetched++;
      const rows = parseFdCsv(csv, slug, season.label);
      log(`  → ${rows.length} matches parsed`);

      let stored = 0;
      for (const row of rows) {
        const changed = recordMatchResult(slug, row);
        if (changed) stored++;
      }
      stats.stored += stored;
      log(`  → ${stored} new results stored`);

      completedSet.add(key);
      saveProgress({ completed: [...completedSet], updatedAt: new Date().toISOString() });
      await sleep(DELAY_MS);
    }
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args    = process.argv.slice(2);
  const seasons = parseInt(args.find(a => a.startsWith("--seasons="))?.split("=")[1] || "5", 10);
  const slug    = args.find(a => a.startsWith("--slug="))?.split("=")[1] || null;

  backfillHistoricalResults({ seasons, slug }).then(r => {
    console.log(JSON.stringify({
      fetched: r.fetched, skipped: r.skipped, stored: r.stored, errors: r.errors,
      leaguesWithResults: Object.keys(r.results || {}).length,
      guarantees: { canonicalWrites: 0 },
    }, null, 2));
  }).catch(err => {
    console.error("fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
