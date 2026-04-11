// ============================================================
// BUILD STANDINGS DAY
// AI-style standings state builder for active leagues
// Builds league table primarily from local current-season match truth
// Writes: data/standings/<league>.json
// Compatible with core/competition-context.js
// ============================================================

import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";

const DEFAULT_SEASON = "2025-2026";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[().,/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function resolveLeagueSlug(leagueEntry) {
  if (typeof leagueEntry === "string") return leagueEntry;

  if (leagueEntry && typeof leagueEntry === "object") {
    return leagueEntry.slug || null;
  }

  return null;
}

function getCurrentSeasonHistoryRows(season = DEFAULT_SEASON) {
  const filePath = resolveDataPath("history", `${season}.json`);
  const raw = readJsonSafe(filePath, []);
  return safeArray(raw);
}

function isFinalStatus(status) {
  const s = String(status || "").toUpperCase();

  return (
    s === "FT" ||
    s === "FINAL" ||
    s === "STATUS_FULL_TIME" ||
    s === "FULL_TIME"
  );
}

function getLeagueSlugFromRow(row) {
  return (
    row?.leagueSlug ||
    row?.league ||
    row?.competitionSlug ||
    null
  );
}

function getHomeTeam(row) {
  return row?.homeTeam || row?.home || null;
}

function getAwayTeam(row) {
  return row?.awayTeam || row?.away || null;
}

function getScoreHome(row) {
  return toNumber(
    row?.scoreHome,
    Number.isFinite(Number(row?.homeScore)) ? Number(row.homeScore) : NaN
  );
}

function getScoreAway(row) {
  return toNumber(
    row?.scoreAway,
    Number.isFinite(Number(row?.awayScore)) ? Number(row.awayScore) : NaN
  );
}

function makeEmptyTeamRow(teamName) {
  return {
    position: 0,
    rank: 0,
    teamId: null,
    team: teamName,
    teamName,
    name: teamName,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    confidence: 0.9
  };
}

function getOrCreateTeam(tableMap, teamName) {
  const key = normalizeText(teamName);
  if (!key) return null;

  if (!tableMap.has(key)) {
    tableMap.set(key, makeEmptyTeamRow(teamName));
  }

  return tableMap.get(key);
}

function applyMatchToTable(tableMap, row) {
  const homeTeam = getHomeTeam(row);
  const awayTeam = getAwayTeam(row);

  const scoreHome = getScoreHome(row);
  const scoreAway = getScoreAway(row);

  if (!homeTeam || !awayTeam) return;
  if (!Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) return;

  const home = getOrCreateTeam(tableMap, homeTeam);
  const away = getOrCreateTeam(tableMap, awayTeam);

  if (!home || !away) return;

  home.played += 1;
  away.played += 1;

  home.goalsFor += scoreHome;
  home.goalsAgainst += scoreAway;

  away.goalsFor += scoreAway;
  away.goalsAgainst += scoreHome;

  if (scoreHome > scoreAway) {
    home.wins += 1;
    home.points += 3;
    away.losses += 1;
  } else if (scoreHome < scoreAway) {
    away.wins += 1;
    away.points += 3;
    home.losses += 1;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }
}

function finalizeTableRows(tableMap) {
  const rows = Array.from(tableMap.values()).map(row => {
    const goalDiff = row.goalsFor - row.goalsAgainst;
    return {
      ...row,
      goalDiff
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    const aName = normalizeText(a.team || a.teamName || a.name);
    const bName = normalizeText(b.team || b.teamName || b.name);
    return aName.localeCompare(bName);
  });

  return rows.map((row, idx) => ({
    ...row,
    position: idx + 1,
    rank: idx + 1
  }));
}

function buildTableFromHistoryRows(rows, slug) {
  const filtered = safeArray(rows).filter(row => {
    const rowLeague = getLeagueSlugFromRow(row);
    if (rowLeague !== slug) return false;
    if (!isFinalStatus(row?.status)) return false;

    const homeTeam = getHomeTeam(row);
    const awayTeam = getAwayTeam(row);
    const scoreHome = getScoreHome(row);
    const scoreAway = getScoreAway(row);

    return (
      !!homeTeam &&
      !!awayTeam &&
      Number.isFinite(scoreHome) &&
      Number.isFinite(scoreAway)
    );
  });

  const tableMap = new Map();

  for (const row of filtered) {
    applyMatchToTable(tableMap, row);
  }

  return finalizeTableRows(tableMap);
}

// ------------------------------------------------------------
// CANDIDATE COLLECTION
// ------------------------------------------------------------
function collectStandingsCandidatesForLeague(slug, dayKey, options = {}) {
  const season = String(options.season || DEFAULT_SEASON);
  const candidates = [];

  // Candidate 1: current-season truth reconstructed from history
  try {
    const historyRows = getCurrentSeasonHistoryRows(season);
    const tableFromHistory = buildTableFromHistoryRows(historyRows, slug);

    candidates.push({
      type: "local_truth_history",
      label: `history-${season}`,
      ok: tableFromHistory.length > 0,
      confidence: tableFromHistory.length > 0 ? 0.9 : 0,
      rows: tableFromHistory
    });
  } catch (e) {
    candidates.push({
      type: "local_truth_history",
      label: `history-${season}`,
      ok: false,
      confidence: 0,
      error: e?.message || "history_table_build_failed",
      rows: []
    });
  }

  // Candidate 2: existing standings artifact, if already present
  try {
    const localFile = resolveDataPath("standings", `${slug}.json`);
    const parsed = readJsonSafe(localFile, null);
    const rows = safeArray(parsed?.table);

    candidates.push({
      type: "existing_artifact",
      label: "existing-standings-artifact",
      ok: rows.length > 0,
      confidence: rows.length > 0 ? 0.7 : 0,
      rows
    });
  } catch (e) {
    candidates.push({
      type: "existing_artifact",
      label: "existing-standings-artifact",
      ok: false,
      confidence: 0,
      error: e?.message || "existing_artifact_read_failed",
      rows: []
    });
  }

  return candidates;
}

// ------------------------------------------------------------
// RECONCILIATION
// ------------------------------------------------------------
function chooseBestCandidate(candidates = []) {
  const valid = safeArray(candidates)
    .filter(c => c?.ok && safeArray(c?.rows).length > 0)
    .sort((a, b) => (Number(b?.confidence) || 0) - (Number(a?.confidence) || 0));

  return valid[0] || null;
}

function normalizeStandingsRow(row, index = 0) {
  const goalsFor = toNumber(row?.goalsFor, toNumber(row?.gf, 0));
  const goalsAgainst = toNumber(row?.goalsAgainst, toNumber(row?.ga, 0));

  return {
    position: toNumber(row?.position, toNumber(row?.rank, index + 1)),
    rank: toNumber(row?.rank, toNumber(row?.position, index + 1)),

    teamId:
      row?.teamId != null
        ? String(row.teamId)
        : null,

    team:
      row?.team ||
      row?.teamName ||
      row?.name ||
      null,

    teamName:
      row?.teamName ||
      row?.team ||
      row?.name ||
      null,

    name:
      row?.name ||
      row?.teamName ||
      row?.team ||
      null,

    played: toNumber(row?.played, toNumber(row?.matchesPlayed, 0)),
    wins: toNumber(row?.wins, 0),
    draws: toNumber(row?.draws, 0),
    losses: toNumber(row?.losses, 0),

    goalsFor,
    goalsAgainst,
    goalDiff: toNumber(row?.goalDiff, goalsFor - goalsAgainst),

    points: toNumber(row?.points, 0),

    confidence: Number.isFinite(Number(row?.confidence))
      ? Number(row.confidence)
      : 0.8
  };
}

function reconcileStandingsRows(slug, candidates = []) {
  const best = chooseBestCandidate(candidates);

  if (!best) {
    return {
      league: slug,
      confidence: 0,
      sourceAudit: candidates.map(c => ({
        type: c?.type || "unknown",
        label: c?.label || "unknown",
        ok: !!c?.ok
      })),
      table: []
    };
  }

  const normalized = safeArray(best.rows)
    .map((row, idx) => normalizeStandingsRow(row, idx))
    .filter(row => !!normalizeText(row.team || row.teamName || row.name))
    .sort((a, b) => {
      const pa = toNumber(a.position, 999);
      const pb = toNumber(b.position, 999);
      return pa - pb;
    });

  return {
    league: slug,
    confidence: Number(best.confidence) || 0.8,
    sourceAudit: candidates.map(c => ({
      type: c?.type || "unknown",
      label: c?.label || "unknown",
      ok: !!c?.ok
    })),
    table: normalized
  };
}

function writeLeagueStandingsArtifact(slug, state) {
  const outDir = resolveDataPath("standings");
  ensureDir(outDir);

  const filePath = path.join(outDir, `${slug}.json`);

  const payload = {
    league: slug,
    updatedAt: Date.now(),
    confidence: Number(state?.confidence) || 0,
    sourceAudit: safeArray(state?.sourceAudit),
    table: safeArray(state?.table)
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    filePath,
    rowsCount: payload.table.length
  };
}

export async function buildStandingsDay(dayKey, leagues = [], options = {}) {
  const season = String(options.season || DEFAULT_SEASON);
  const results = [];

  for (const leagueEntry of leagues) {
    const slug = resolveLeagueSlug(leagueEntry);

    if (!slug) {
      results.push({
        league: null,
        ok: false,
        reason: "missing_slug"
      });
      continue;
    }

    try {
      const candidates = collectStandingsCandidatesForLeague(slug, dayKey, { season });
      const state = reconcileStandingsRows(slug, candidates);
      const written = writeLeagueStandingsArtifact(slug, state);

      results.push({
        league: slug,
        ok: true,
        found: written.rowsCount > 0,
        rowsCount: written.rowsCount,
        confidence: Number(state?.confidence) || 0
      });
    } catch (err) {
      results.push({
        league: slug,
        ok: false,
        reason: err?.message || "standings_build_failed"
      });
    }
  }

  return {
    ok: true,
    dayKey,
    season,
    leagues: results.length,
    collected: results.filter(x => x.ok).length,
    withData: results.filter(x => x.ok && x.found).length,
    results
  };
}