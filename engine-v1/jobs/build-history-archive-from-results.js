/**
 * build-history-archive-from-results.js
 *
 * Convert the accumulated match-results memory (data/league-memory/results/{slug}.json,
 * filled by the Sofascore / football-data / ESPN backfills) into the per-season
 * history-archive (data/history-archive/{slug}/{season}.json) that build-model-priors
 * consumes. This is a PURE local transformation — no network, no scraping — that
 * unlocks 5-season value priors for every league whose results we already hold but
 * whose archive was never built (the ESPN-only backfill-history job can't reach the
 * long tail: ~100 leagues have results but zero archive → value falls back to the
 * flat league-average prior).
 *
 * Results store shape: { teams: { <team>: [ { matchId, date, opp, ha, gf, ga, res } ] } }
 *   Each match is stored twice (once per team); the ha==="H" entries are the full
 *   home-oriented match list — home=<team>, away=opp, scoreHome=gf, scoreAway=ga.
 *
 * Archive shape (matches build-model-priors' reader): { leagueSlug, season, matches:
 *   [ { leagueSlug, homeTeam, awayTeam, scoreHome, scoreAway, season, dayKey, ... } ] }.
 *
 * Additive by default: a season file that already exists (e.g. from the ESPN
 * backfill-history job) is left untouched so we never overwrite validated data —
 * pass --overwrite to rebuild it from results instead.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ALL_LEAGUE_SEEDS } from "../config.js";
import { resolveDataPath } from "../storage/data-root.js";
import { currentSeason, priorSeasons } from "../core/season.js";

// Seasons that feed the priors (build-model-priors sources 2021-22 … 2024-25) plus
// the current one for completeness. Older seasons in results are ignored (5y cap).
// The 5 completed seasons + the current one — derived so it rolls forward
// automatically (season.js), instead of a frozen literal list.
const DEFAULT_SEASONS = [...priorSeasons(5), currentSeason()];

const RESULTS_DIR = resolveDataPath("league-memory", "results");
const ARCHIVE_ROOT = resolveDataPath("history-archive");

function readJsonSafe(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Football season label for a date: runs Aug→May, split at July 1. A match in
// Jan-Jun belongs to the season that STARTED the previous calendar year.
function seasonForDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1-12
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

function dayKeyFromDate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function deriveOutcome(sh, sa) {
  if (sh === sa) return "DRAW";
  return sh > sa ? "HOME" : "AWAY";
}

// Light team-name key to collapse the SAME match ingested from multiple sources
// (ESPN + Sofascore store it under different matchIds, and with minor spelling
// variants like "Tel Aviv" / "Tel-Aviv"), so a real fixture is counted once.
function nameKey(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchDedupKey(dayKey, home, away) {
  return `${dayKey}|${nameKey(home)}|${nameKey(away)}`;
}

// Reconstruct season→matches[] for one league from its results ledger.
function bucketLeagueMatches(slug, resultsPayload, seasonsSet) {
  const teams = resultsPayload?.teams || {};
  const bySeason = new Map(); // season → Map<matchId, row>

  for (const [teamName, entries] of Object.entries(teams)) {
    for (const e of Array.isArray(entries) ? entries : []) {
      if (e?.ha !== "H") continue;              // home view = one row per match
      if (e.gf == null || e.ga == null) continue;
      if (!e.date) continue;

      const season = seasonForDate(e.date);
      if (!season || !seasonsSet.has(season)) continue;

      const scoreHome = safeNum(e.gf);
      const scoreAway = safeNum(e.ga);
      const dayKey = dayKeyFromDate(e.date);

      const row = {
        id: e.matchId || `${slug}_${dayKey}_${teamName}_${e.opp}`,
        season,
        dayKey,
        kickoff: e.date,
        kickoff_ms: Date.parse(e.date) || null,
        leagueSlug: slug,
        homeTeam: teamName,
        awayTeam: e.opp,
        scoreHome,
        scoreAway,
        status: "FT",
        outcome: deriveOutcome(scoreHome, scoreAway),
        source: "results-memory",
        phase: "regular"
      };

      // Dedup by fixture identity (day + teams), not matchId, so the same match
      // from two sources collapses to one row.
      if (!bySeason.has(season)) bySeason.set(season, new Map());
      const key = matchDedupKey(dayKey, teamName, e.opp);
      if (!bySeason.get(season).has(key)) bySeason.get(season).set(key, row);
    }
  }

  return bySeason;
}

export function buildHistoryArchiveFromResults(opts = {}) {
  const seasons = Array.isArray(opts.seasons) && opts.seasons.length ? opts.seasons : DEFAULT_SEASONS;
  const seasonsSet = new Set(seasons);
  const overwrite = Boolean(opts.overwrite);
  // Daily mode: always rewrite the CURRENT season (it grows every matchday) but
  // leave completed seasons untouched once written (they are stable history).
  // A completed season is (re)written only when its file is MISSING, and that is
  // the signal a season has just rolled into history → rebuild priors.
  const refreshCurrentSeason = opts.refreshCurrentSeason !== false;
  const curSeason = currentSeason();
  const leagues = Array.isArray(opts.leagues) && opts.leagues.length ? opts.leagues : ALL_LEAGUE_SEEDS.slice();

  ensureDir(ARCHIVE_ROOT);

  const summary = {
    ok: true,
    startedAt: Date.now(),
    seasons,
    overwrite,
    currentSeason: curSeason,
    leaguesConsidered: leagues.length,
    leaguesWithResults: 0,
    filesWritten: 0,
    currentSeasonFilesWritten: 0,
    pastSeasonsWritten: 0,      // completed-season files newly created → rollover
    filesSkippedExisting: 0,
    matchesWritten: 0,
    byLeague: []
  };

  for (const slug of leagues) {
    const resultsFile = path.join(RESULTS_DIR, `${slug}.json`);
    const payload = readJsonSafe(resultsFile, null);
    if (!payload?.teams) continue;

    summary.leaguesWithResults += 1;
    const bySeason = bucketLeagueMatches(slug, payload, seasonsSet);

    const leagueDir = ensureDir(path.join(ARCHIVE_ROOT, slug));
    const written = [];

    for (const season of seasons) {
      const matchesMap = bySeason.get(season);
      if (!matchesMap || !matchesMap.size) continue;

      const outFile = path.join(leagueDir, `${season}.json`);
      // A season file only counts as existing if it actually holds matches —
      // the ESPN backfill leaves empty shells (stats.normalized=0, matches:[])
      // for leagues it can't reach, and those must be rebuilt, not skipped.
      const existing = fs.existsSync(outFile) ? readJsonSafe(outFile, null) : null;
      const exists = Array.isArray(existing?.matches) && existing.matches.length > 0;
      const isCurrent = season === curSeason;

      // Past seasons: write once (skip if present) unless a full --overwrite.
      // Current season: rewrite every run (unless refresh disabled) so it stays live.
      if (exists && !overwrite && !(isCurrent && refreshCurrentSeason)) {
        summary.filesSkippedExisting += 1;
        continue;
      }

      const matches = [...matchesMap.values()].sort(
        (a, b) => (a.kickoff_ms || 0) - (b.kickoff_ms || 0) || String(a.id).localeCompare(String(b.id))
      );

      const archivePayload = {
        leagueSlug: slug,
        season,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stats: { source: "results-memory", kept: matches.length },
        matches
      };

      fs.writeFileSync(outFile, JSON.stringify(archivePayload, null, 2), "utf8");
      summary.filesWritten += 1;
      summary.matchesWritten += matches.length;
      if (isCurrent) summary.currentSeasonFilesWritten += 1;
      else if (!exists) summary.pastSeasonsWritten += 1; // completed season newly archived
      written.push({ season, matches: matches.length });
    }

    if (written.length) summary.byLeague.push({ slug, written });
  }

  summary.finishedAt = Date.now();
  return summary;
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const args = Object.fromEntries(
    process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
      const [k, v = ""] = a.slice(2).split("=");
      return [k, v];
    })
  );
  const parseList = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);

  const summary = buildHistoryArchiveFromResults({
    leagues: parseList(args.leagues),
    seasons: parseList(args.seasons),
    overwrite: String(args.overwrite || "").toLowerCase() === "true"
  });

  console.log(JSON.stringify({
    ...summary,
    byLeague: summary.byLeague.slice(0, 40),
    byLeagueTruncated: summary.byLeague.length > 40 ? summary.byLeague.length - 40 : 0
  }, null, 2));
}
