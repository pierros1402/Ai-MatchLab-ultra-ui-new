import fs from "fs";
import path from "path";
import { ALL_LEAGUE_SEEDS } from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { resolveDataPath } from "../storage/data-root.js";

const ARCHIVE_ROOT = resolveDataPath("history-archive");

// ------------------------------------------------------------
// CONFIG
// ------------------------------------------------------------
const DEFAULT_SEASONS = [
  "2021-2022",
  "2022-2023",
  "2023-2024",
  "2024-2025",
  "2025-2026"
];

const DEFAULT_DELAY_MS = 180;
const DEFAULT_RETRY_DELAY_MS = 600;
const DEFAULT_MAX_RETRIES = 2;

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function seasonStartDay(season) {
  const [startYear] = String(season).split("-");
  return `${startYear}-07-01`;
}

function seasonEndDay(season) {
  const [, endYear] = String(season).split("-");
  return `${endYear}-06-30`;
}

function dayToDate(dayKey) {
  return new Date(`${dayKey}T00:00:00Z`);
}

function dateToDayKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dayKey, delta) {
  const d = dayToDate(dayKey);
  d.setUTCDate(d.getUTCDate() + delta);
  return dateToDayKey(d);
}

function buildSeasonDays(season) {
  const out = [];
  let cur = seasonStartDay(season);
  const end = seasonEndDay(season);

  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }

  return out;
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isTerminalStatus(status) {
  const s = String(status || "").toUpperCase();
  return (
    s === "FT" ||
    s.includes("FULL_TIME") ||
    s.includes("FINAL") ||
    s.includes("AET") ||
    s.includes("AFTER_EXTRA_TIME") ||
    s.includes("PEN") ||
    s.includes("PENALTIES")
  );
}

function normalizeArchiveRow(normalized, season) {
  if (!normalized) return null;

  return {
    id: normalized.matchId,
    season,
    dayKey: normalized.dayKey,
    kickoff: normalized.kickoffUtc,
    kickoff_ms: normalized.kickoffUtc ? Date.parse(normalized.kickoffUtc) : null,
    leagueSlug: normalized.leagueSlug,
    leagueName: normalized.leagueName,
    homeTeam: normalized.homeTeam,
    awayTeam: normalized.awayTeam,
    scoreHome: safeNum(normalized.scoreHome, 0),
    scoreAway: safeNum(normalized.scoreAway, 0),
    status: normalized.status,
    rawStatus: normalized.rawStatus,
    minute: normalized.minute || null,
    outcome: deriveOutcome(normalized),
    source: normalized.source || "espn",
    venue: normalized.venue || null,
    competitionType: normalized.competitionType || null,
    leagueTier: normalized.leagueTier ?? null,
    leagueTrust: normalized.leagueTrust || null,
    phase: normalized.phase || "regular"
  };
}

function deriveOutcome(match) {
  const sh = safeNum(match?.scoreHome, null);
  const sa = safeNum(match?.scoreAway, null);

  if (sh === null || sa === null) return null;
  if (sh === sa) return "DRAW";
  return sh > sa ? "HOME" : "AWAY";
}

function buildMatchKey(row) {
  return JSON.stringify([
    row.leagueSlug || "",
    row.dayKey || "",
    row.homeTeam || "",
    row.awayTeam || "",
    row.kickoff || ""
  ]);
}

function sortArchiveRows(rows = []) {
  return rows.sort((a, b) => {
    const ta = Number(a?.kickoff_ms || 0);
    const tb = Number(b?.kickoff_ms || 0);
    if (ta !== tb) return ta - tb;

    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function archiveLeagueDir(slug) {
  return ensureDir(path.join(ARCHIVE_ROOT, slug));
}

function archiveFilePath(slug, season) {
  return path.join(archiveLeagueDir(slug), `${season}.json`);
}

function writeArchiveFile(slug, season, payload) {
  const filePath = archiveFilePath(slug, season);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function fetchDayWithRetry(slug, dayKey, opts = {}) {
  const maxRetries = Number.isFinite(opts.maxRetries)
    ? opts.maxRetries
    : DEFAULT_MAX_RETRIES;

  const retryDelayMs = Number.isFinite(opts.retryDelayMs)
    ? opts.retryDelayMs
    : DEFAULT_RETRY_DELAY_MS;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const data = await fetchLeagueFixtures(slug, dayKey);
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw lastError || new Error(`fetch failed for ${slug} ${dayKey}`);
}

// ------------------------------------------------------------
// CORE
// ------------------------------------------------------------
export async function backfillLeagueSeason(slug, season, opts = {}) {
  const delayMs = Number.isFinite(opts.delayMs) ? opts.delayMs : DEFAULT_DELAY_MS;
  const includeNonTerminal = Boolean(opts.includeNonTerminal);

  const days = buildSeasonDays(season);
  const matchMap = new Map();

  const stats = {
    slug,
    season,
    seasonStart: seasonStartDay(season),
    seasonEnd: seasonEndDay(season),
    daysScanned: 0,
    rawEvents: 0,
    normalized: 0,
    kept: 0,
    deduped: 0,
    skippedWrongDay: 0,
    skippedNull: 0,
    skippedNonTerminal: 0,
    errors: 0
  };

  for (const dayKey of days) {
  if (stats.daysScanned % 20 === 0) {
    console.log("[backfill progress]", slug, season, `${stats.daysScanned}/${days.length}`);
  }
    stats.daysScanned += 1;

    let data;
    try {
      data = await fetchDayWithRetry(slug, dayKey, opts);
    } catch (err) {
      stats.errors += 1;
      continue;
    }

    const events = Array.isArray(data?.events) ? data.events : [];
    stats.rawEvents += events.length;

    for (const event of events) {
      const normalized = normalizeFixture(event, slug);

      if (!normalized) {
        stats.skippedNull += 1;
        continue;
      }

      stats.normalized += 1;

      if (normalized.dayKey !== dayKey) {
        stats.skippedWrongDay += 1;
        continue;
      }

      if (!includeNonTerminal && !isTerminalStatus(normalized.status || normalized.rawStatus)) {
        stats.skippedNonTerminal += 1;
        continue;
      }

      const row = normalizeArchiveRow(normalized, season);
      if (!row) continue;

      const key = buildMatchKey(row);

      if (!matchMap.has(key)) {
        matchMap.set(key, row);
        stats.kept += 1;
      } else {
        const prev = matchMap.get(key);

        // Prefer better/final row if somehow duplicated
        if (
          isTerminalStatus(row.status) &&
          !isTerminalStatus(prev?.status)
        ) {
          matchMap.set(key, row);
        }

        stats.deduped += 1;
      }
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  const matches = sortArchiveRows([...matchMap.values()]);

  const payload = {
    leagueSlug: slug,
    season,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stats,
    matches
  };

  const filePath = writeArchiveFile(slug, season, payload);

  return {
    ok: true,
    slug,
    season,
    filePath,
    stats,
    matchesWritten: matches.length
  };
}

export async function backfillHistoryArchive(opts = {}) {
  const seasons = Array.isArray(opts.seasons) && opts.seasons.length
    ? opts.seasons
    : DEFAULT_SEASONS;

  const leagues = Array.isArray(opts.leagues) && opts.leagues.length
    ? opts.leagues
    : ALL_LEAGUE_SEEDS.slice();

  ensureDir(ARCHIVE_ROOT);

  const summary = {
    ok: true,
    startedAt: Date.now(),
    seasons,
    leagues,
    totalJobs: seasons.length * leagues.length,
    completedJobs: 0,
    failedJobs: 0,
    results: []
  };

  for (const slug of leagues) {
    for (const season of seasons) {
      try {
        const res = await backfillLeagueSeason(slug, season, opts);
        summary.results.push(res);
        summary.completedJobs += 1;

        console.log("[backfill]", slug, season, {
          matchesWritten: res.matchesWritten,
          rawEvents: res.stats.rawEvents,
          kept: res.stats.kept,
          skippedWrongDay: res.stats.skippedWrongDay,
          skippedNonTerminal: res.stats.skippedNonTerminal,
          errors: res.stats.errors
        });
      } catch (err) {
        summary.failedJobs += 1;
        summary.results.push({
          ok: false,
          slug,
          season,
          error: String(err?.message || err)
        });

        console.error("[backfill:error]", slug, season, err?.message || err);
      }
    }
  }

  summary.finishedAt = Date.now();
  summary.ms = summary.finishedAt - summary.startedAt;

  return summary;
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
function parseCliArgs(argv = []) {
  const out = {};

  for (const raw of argv) {
    const arg = String(raw || "").trim();

    if (!arg.startsWith("--")) continue;

    const [k, v = ""] = arg.slice(2).split("=");

    out[k] = v;
  }

  return out;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  const seasons = parseList(args.seasons);
  const leagues = parseList(args.leagues);

  const summary = await backfillHistoryArchive({
    seasons: seasons.length ? seasons : DEFAULT_SEASONS,
    leagues: leagues.length ? leagues : ALL_LEAGUE_SEEDS.slice(),
    delayMs: safeNum(args.delayMs, DEFAULT_DELAY_MS),
    retryDelayMs: safeNum(args.retryDelayMs, DEFAULT_RETRY_DELAY_MS),
    maxRetries: safeNum(args.maxRetries, DEFAULT_MAX_RETRIES),
    includeNonTerminal: String(args.includeNonTerminal || "").toLowerCase() === "true"
  });

  console.log(JSON.stringify(summary, null, 2));
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href;

if (isDirectRun) {
  main().catch(err => {
    console.error("[backfill-history] fatal", err);
    process.exit(1);
  });
}