import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";

const CURRENT_HISTORY_DIR = resolveDataPath("history");
const ARCHIVE_HISTORY_DIR = resolveDataPath("history-archive");

const __currentSeasonRowsCache = new Map();
const __archiveLeagueSeasonCache = new Map();
const __archiveSeasonListCache = new Map();

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|afc|club|athletic|de|the|ac|as|fk|nk|sk|if|bk|ik|ff|sv|tsv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function teamTokens(name) {
  return normalizeTeamName(name).split(" ").filter(Boolean);
}

export function isSameTeamName(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);

  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = teamTokens(a);
  const tb = teamTokens(b);
  if (!ta.length || !tb.length) return false;

  const common = ta.filter(x => tb.includes(x));

  if (common.length >= 2) return true;
  if (common.length === 1 && Math.max(ta.length, tb.length) === 1) return true;

  return false;
}

function sortByKickoffDesc(a, b) {
  return safeNum(b?.kickoff_ms, 0) - safeNum(a?.kickoff_ms, 0);
}

function resolveSeasonFromDay(dayKey) {
  if (!dayKey) return null;

  const d = new Date(dayKey);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  // season split: Aug → Jul
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
}

function isFinalRow(row) {
  const s = String(row?.status || "").toUpperCase();
  return s === "FT" || s.includes("FINAL") || s.includes("FULL_TIME") || s.includes("COMPLETE") || s.includes("AET") || s.includes("PEN");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeHistoryRow(row, fallbackSeason = null) {
  if (!row || typeof row !== "object") return null;

  const homeTeam = String(row.homeTeam || "").trim();
  const awayTeam = String(row.awayTeam || "").trim();
  if (!homeTeam || !awayTeam) return null;

  const kickoff = row.kickoff || row.kickoffUtc || null;
  const kickoffMs = Number.isFinite(Number(row.kickoff_ms))
    ? Number(row.kickoff_ms)
    : kickoff
      ? Date.parse(kickoff)
      : null;

  return {
    id: String(row.id || row.matchId || ""),
    season: row.season || fallbackSeason || null,
    dayKey: row.dayKey || null,
    kickoff,
    kickoff_ms: Number.isFinite(kickoffMs) ? kickoffMs : null,
    leagueSlug: row.leagueSlug || null,
    leagueName: row.leagueName || null,
    homeTeam,
    awayTeam,
    scoreHome: safeNum(row.scoreHome, null),
    scoreAway: safeNum(row.scoreAway, null),
    status: row.status || "",
    rawStatus: row.rawStatus || "",
    minute: row.minute || null,
    outcome: row.outcome || null,
    source: row.source || "history",
    venue: row.venue || null,
    competitionType: row.competitionType || null,
    leagueTier: row.leagueTier ?? null,
    leagueTrust: row.leagueTrust ?? null,
    phase: row.phase || null
  };
}

export function readCurrentSeasonRows(season) {
  if (__currentSeasonRowsCache.has(season)) {
    return __currentSeasonRowsCache.get(season);
  }

  const filePath = path.join(CURRENT_HISTORY_DIR, `${season}.json`);
  const payload = readJsonSafe(filePath, { days: [] });

  const rows = Array.isArray(payload?.days)
    ? payload.days.flatMap(day => Array.isArray(day?.rows) ? day.rows : [])
    : [];

  const normalized = rows
    .map(row => normalizeHistoryRow(row, season))
    .filter(Boolean)
    .filter(isFinalRow)
    .sort(sortByKickoffDesc);

  __currentSeasonRowsCache.set(season, normalized);
  return normalized;
}

export function getAvailableArchiveSeasons(leagueSlug) {
  const cacheKey = String(leagueSlug || "");
  if (__archiveSeasonListCache.has(cacheKey)) {
    return __archiveSeasonListCache.get(cacheKey);
  }

  const dirPath = path.join(ARCHIVE_HISTORY_DIR, cacheKey);
  let seasons = [];

  try {
    seasons = fs.readdirSync(dirPath)
      .filter(name => name.endsWith(".json"))
      .map(name => name.replace(/\.json$/i, ""))
      .sort();
  } catch {
    seasons = [];
  }

  __archiveSeasonListCache.set(cacheKey, seasons);
  return seasons;
}

export function readArchiveLeagueSeasonRows(leagueSlug, season) {
  const cacheKey = `${leagueSlug}::${season}`;
  if (__archiveLeagueSeasonCache.has(cacheKey)) {
    return __archiveLeagueSeasonCache.get(cacheKey);
  }

  const filePath = path.join(ARCHIVE_HISTORY_DIR, String(leagueSlug || ""), `${season}.json`);
  const payload = readJsonSafe(filePath, { matches: [] });
  const rows = Array.isArray(payload?.matches) ? payload.matches : [];

  const normalized = rows
    .map(row => normalizeHistoryRow(row, season))
    .filter(Boolean)
    .filter(isFinalRow)
    .sort(sortByKickoffDesc);

  __archiveLeagueSeasonCache.set(cacheKey, normalized);
  return normalized;
}

function filterRowsBeforeKickoff(rows, cutoffMs) {
  if (!Number.isFinite(cutoffMs)) return [...rows];
  return rows.filter(row => safeNum(row?.kickoff_ms, 0) < cutoffMs);
}

function dedupeMatches(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = JSON.stringify([
      row?.leagueSlug || "",
      row?.dayKey || "",
      row?.homeTeam || "",
      row?.awayTeam || "",
      row?.kickoff || ""
    ]);

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

export function getRecentTeamMatches(rows, teamName, { limit = 5, leagueSlug = null } = {}) {
  const filtered = rows.filter(row => {
    if (leagueSlug && String(row?.leagueSlug || "") !== String(leagueSlug)) return false;
    return isSameTeamName(row?.homeTeam, teamName) || isSameTeamName(row?.awayTeam, teamName);
  });

  return dedupeMatches(filtered)
    .sort(sortByKickoffDesc)
    .slice(0, limit);
}

export function getHeadToHeadMatches(rows, homeTeam, awayTeam, { limit = 5, leagueSlug = null } = {}) {
  const filtered = rows.filter(row => {
    if (leagueSlug && String(row?.leagueSlug || "") !== String(leagueSlug)) return false;

    const sameDirection = isSameTeamName(row?.homeTeam, homeTeam) && isSameTeamName(row?.awayTeam, awayTeam);
    const reverseDirection = isSameTeamName(row?.homeTeam, awayTeam) && isSameTeamName(row?.awayTeam, homeTeam);

    return sameDirection || reverseDirection;
  });

  return dedupeMatches(filtered)
    .sort(sortByKickoffDesc)
    .slice(0, limit);
}

export function getMatchHistoryContext(match, opts = {}) {
  const leagueSlug = String(match?.leagueSlug || "");
  const dayKey = match?.dayKey || null;
  const season = opts.season || resolveSeasonFromDay(dayKey || match?.kickoffUtc || "");
  const kickoffMs = Number.isFinite(Number(match?.kickoffTs))
    ? Number(match.kickoffTs)
    : match?.kickoffUtc
      ? Date.parse(match.kickoffUtc)
      : null;

  const currentSeasonRows = filterRowsBeforeKickoff(readCurrentSeasonRows(season), kickoffMs);
  const archiveSeasons = opts.archiveSeasons || getAvailableArchiveSeasons(leagueSlug);

  const archiveRows = archiveSeasons.flatMap(archiveSeason =>
    filterRowsBeforeKickoff(readArchiveLeagueSeasonRows(leagueSlug, archiveSeason), kickoffMs)
  );

  const mergedRows = dedupeMatches([...currentSeasonRows, ...archiveRows]).sort(sortByKickoffDesc);

  const homeMatchesSameSeason = getRecentTeamMatches(currentSeasonRows, match?.homeTeam, {
    limit: opts.sameSeasonLimit || 5,
    leagueSlug: opts.sameLeagueOnly ? leagueSlug : null
  });

  const awayMatchesSameSeason = getRecentTeamMatches(currentSeasonRows, match?.awayTeam, {
    limit: opts.sameSeasonLimit || 5,
    leagueSlug: opts.sameLeagueOnly ? leagueSlug : null
  });

  const homeMatchesMerged = getRecentTeamMatches(mergedRows, match?.homeTeam, {
    limit: opts.limit || 5,
    leagueSlug: opts.sameLeagueOnly ? leagueSlug : null
  });

  const awayMatchesMerged = getRecentTeamMatches(mergedRows, match?.awayTeam, {
    limit: opts.limit || 5,
    leagueSlug: opts.sameLeagueOnly ? leagueSlug : null
  });

  const h2hMerged = getHeadToHeadMatches(mergedRows, match?.homeTeam, match?.awayTeam, {
    limit: opts.h2hLimit || 5,
    leagueSlug: opts.sameLeagueOnly ? leagueSlug : null
  });

  return {
    season,
    leagueSlug,
    cutoffKickoffMs: kickoffMs,
    homeMatches: homeMatchesSameSeason.length >= (opts.minSameSeasonSample || 3)
      ? homeMatchesSameSeason
      : homeMatchesMerged,
    awayMatches: awayMatchesSameSeason.length >= (opts.minSameSeasonSample || 3)
      ? awayMatchesSameSeason
      : awayMatchesMerged,
    headToHeadMatches: h2hMerged,
    meta: {
      homeSampleSameSeason: homeMatchesSameSeason.length,
      awaySampleSameSeason: awayMatchesSameSeason.length,
      homeSampleMerged: homeMatchesMerged.length,
      awaySampleMerged: awayMatchesMerged.length,
      h2hSampleMerged: h2hMerged.length,
      archiveSeasonsUsed: archiveSeasons.filter(Boolean),
      usedArchiveForHome: homeMatchesSameSeason.length < (opts.minSameSeasonSample || 3) && homeMatchesMerged.length > homeMatchesSameSeason.length,
      usedArchiveForAway: awayMatchesSameSeason.length < (opts.minSameSeasonSample || 3) && awayMatchesMerged.length > awayMatchesSameSeason.length,
      currentSeasonRows: currentSeasonRows.length,
      archiveRows: archiveRows.length,
      mergedRows: mergedRows.length
    }
  };
}

export function clearHistoryLayerCaches() {
  __currentSeasonRowsCache.clear();
  __archiveLeagueSeasonCache.clear();
  __archiveSeasonListCache.clear();
}