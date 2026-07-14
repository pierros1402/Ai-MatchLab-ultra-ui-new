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
import { currentSeason } from "../core/season.js";
import { readStandings, recordStandingsResult } from "../storage/standings-memory-db.js";
import { currentSeasonLabel } from "../source-discovery/season-calendar.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";

const DEFAULT_SEASON = currentSeason();

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
  const raw = readJsonSafe(filePath, null);

  if (!raw) return [];

  // περίπτωση 1: legacy plain array rows
  if (Array.isArray(raw)) {
    return raw.filter(Boolean);
  }

  // περίπτωση 2: object με days ως array
  if (Array.isArray(raw?.days)) {
    const all = [];

    for (const day of raw.days) {
      if (Array.isArray(day?.rows)) {
        all.push(...day.rows);
      }
    }

    return all;
  }

  // περίπτωση 3: object με days ως keyed object
  if (raw?.days && typeof raw.days === "object") {
    const all = [];

    for (const dayKey of Object.keys(raw.days)) {
      const day = raw.days[dayKey];

      if (Array.isArray(day?.rows)) {
        all.push(...day.rows);
      }
    }

    return all;
  }

  return [];
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

function getPhaseKey(row) {
  const raw = String(row?.phase || "").trim().toLowerCase();

  if (!raw) return "regular";

  if (
    raw.includes("playoff") ||
    raw.includes("championship") ||
    raw.includes("promotion") ||
    raw.includes("final stage")
  ) {
    return "playoff";
  }

  if (
    raw.includes("playout") ||
    raw.includes("relegation")
  ) {
    return "playout";
  }

  if (
    raw.includes("baraz") ||
    raw.includes("barrage")
  ) {
    return "barrage";
  }

  return raw;
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

function buildPhaseTablesFromHistoryRows(rows, slug) {
  const phaseMaps = new Map();

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

  for (const row of filtered) {
    const phase = getPhaseKey(row);

    if (!phaseMaps.has(phase)) {
      phaseMaps.set(phase, new Map());
    }

    applyMatchToTable(phaseMaps.get(phase), row);
  }

  const phases = {};

  for (const [phase, tableMap] of phaseMaps.entries()) {
    phases[phase] = finalizeTableRows(tableMap);
  }

  return phases;
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
    const phaseTables = buildPhaseTablesFromHistoryRows(historyRows, slug);
    const regularTable = safeArray(phaseTables.regular);
    const playoffTable = safeArray(phaseTables.playoff);
    const playoutTable = safeArray(phaseTables.playout);
    const barrageTable = safeArray(phaseTables.barrage);

    const primaryTable =
      regularTable.length ? regularTable :
      playoffTable.length ? playoffTable :
      playoutTable.length ? playoutTable :
      barrageTable.length ? barrageTable :
      [];

    candidates.push({
      type: "local_truth_history",
      label: `history-${season}`,
      ok: primaryTable.length > 0,
      confidence: primaryTable.length > 0 ? 0.9 : 0,
      rows: primaryTable,
      phases: phaseTables
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

  // Candidate 3: accepted table from the league-memory research store —
  // the SAME store assessment and odds attribution read. Including it here
  // keeps data/standings and league-memory converging on one truth instead
  // of split-brain (details showing nothing while assessment has a table).
  try {
    const memory = readStandings(slug);
    const rows = safeArray(memory?.accepted?.rows);
    const memConfidence = Number(memory?.accepted?.confidence) || 0;

    candidates.push({
      type: "league_memory",
      label: `league-memory-${memory?.accepted?.season || "unknown"}`,
      ok: rows.length > 0,
      confidence: rows.length > 0 ? Math.min(0.9, memConfidence) : 0,
      rows
    });
  } catch (e) {
    candidates.push({
      type: "league_memory",
      label: "league-memory",
      ok: false,
      confidence: 0,
      error: e?.message || "league_memory_read_failed",
      rows: []
    });
  }

  return candidates;
}

// ------------------------------------------------------------
// RECONCILIATION
// ------------------------------------------------------------
// Candidates are ranked by confidence SCALED BY COMPLETENESS so a partial
// history table (e.g. 6/20 teams) cannot shadow a full table from the
// league-memory store or a previously built artifact.
function chooseBestCandidate(candidates = [], slug = "") {
  const effectiveConfidence = c => {
    const conf = Number(c?.confidence) || 0;
    const { completeness } = computeStandingsCompleteness(safeArray(c?.rows), slug);
    return conf * Math.max(completeness, 0.01);
  };

  const valid = safeArray(candidates)
    .filter(c => c?.ok && safeArray(c?.rows).length > 0)
    .sort((a, b) => effectiveConfidence(b) - effectiveConfidence(a));

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

function estimateExpectedLeagueSize(slug) {
  const map = {
    "eng.1": 20,
    "eng.2": 24,
    "eng.3": 24,
    "eng.4": 24,
    "eng.5": 24,
    "ger.1": 18,
    "ger.2": 18,
    "esp.1": 20,
    "esp.2": 22,
    "ita.1": 20,
    "ita.2": 20,
    "fra.1": 18,
    "fra.2": 18,
    "ned.1": 18,
    "ned.2": 20,
    "por.1": 18,
    "bel.1": 16,
    "sco.1": 12,
    "sco.2": 10,
    "tur.1": 20,
    "aut.1": 12,
    "swe.1": 16,
    "nor.1": 16,
    "usa.1": 15,
    "arg.1": 28,
    "arg.2": 18,
    "bra.1": 20,
    "bra.2": 20,
    "uru.1": 16,
    "chi.1": 16,
    "jpn.1": 20,
    "ksa.1": 18,
    "rsa.1": 16,
    "rsa.2": 16
  };

  return map[slug] || 20;
}

export function computeStandingsCompleteness(rows = [], slug = "") {
  const rowCount = safeArray(rows).length;
  const expectedSize = estimateExpectedLeagueSize(slug);

  if (!rowCount || expectedSize <= 0) {
    return {
      rowCount,
      expectedSize,
      completeness: 0,
      oversized: false
    };
  }

  // Fail-closed upper guard: a clean league table holds at most one row per team,
  // so its row count cannot materially exceed the expected team set. A table that
  // does is a cumulative all-time aggregate or several parallel groups folded into
  // one slug (aus.1 185/20, arg.2 43/18, swe.1 29/16). Capping completeness at 1
  // let these pass as fully complete; instead treat them as untrustworthy. The
  // slack tolerates estimate imprecision (an unmapped 24-team league seen as 20).
  const oversizedThreshold = Math.max(expectedSize + 3, Math.ceil(expectedSize * 1.35));
  if (rowCount > oversizedThreshold) {
    return {
      rowCount,
      expectedSize,
      completeness: 0,
      oversized: true
    };
  }

  return {
    rowCount,
    expectedSize,
    completeness: Math.max(0, Math.min(1, rowCount / expectedSize)),
    oversized: false
  };
}

function validateStandingsShape(rows = []) {
  const safeRows = safeArray(rows);

  if (!safeRows.length) {
    return {
      ok: false,
      validRows: [],
      reasons: ["no_rows"]
    };
  }

  const validRows = safeRows.filter(row => {
    const team = row?.team || row?.teamName || row?.name;
    const position = Number(row?.position ?? row?.rank);

    return !!normalizeText(team) && Number.isFinite(position) && position > 0;
  });

  const uniqueTeams = new Set(
    validRows.map(row => normalizeText(row?.team || row?.teamName || row?.name))
  );

  const uniquePositions = new Set(
    validRows.map(row => Number(row?.position ?? row?.rank))
  );

  const reasons = [];

  if (!validRows.length) reasons.push("no_valid_rows");
  if (uniqueTeams.size !== validRows.length) reasons.push("duplicate_teams");
  if (uniquePositions.size !== validRows.length) reasons.push("duplicate_positions");

  return {
    ok: reasons.length === 0,
    validRows,
    reasons
  };
}

export function scoreStandingsConfidence(rows = [], slug = "", baseConfidence = 0.9) {
  const { validRows, reasons } = validateStandingsShape(rows);
  const { rowCount, expectedSize, completeness, oversized } = computeStandingsCompleteness(validRows, slug);

  if (!validRows.length) {
    return {
      confidence: 0,
      completeness,
      rowCount,
      expectedSize,
      reasons: reasons.length ? reasons : ["no_valid_rows"]
    };
  }

  // hard fail-close: an oversized table (more rows than the league can have) is a
  // cumulative/multi-group aggregate, never reliable current-season truth.
  if (oversized) {
    return {
      confidence: 0,
      completeness,
      rowCount,
      expectedSize,
      reasons: [...reasons, "oversized_table"]
    };
  }

  // hard floor: tables that are too small are not reliable competition context
  if (rowCount < 6) {
    return {
      confidence: 0,
      completeness,
      rowCount,
      expectedSize,
      reasons: [...reasons, "too_small_for_context"]
    };
  }

  // stronger penalty for incomplete tables
  let confidence = Number(baseConfidence) || 0.8;

  confidence *= completeness;

  if (rowCount < 10) confidence *= 0.65;
  else if (rowCount < 14) confidence *= 0.82;
  else if (rowCount < 18) confidence *= 0.92;

  if (reasons.includes("duplicate_teams")) confidence *= 0.5;
  if (reasons.includes("duplicate_positions")) confidence *= 0.5;

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    confidence,
    completeness,
    rowCount,
    expectedSize,
    reasons
  };
}

function reconcileStandingsRows(slug, candidates = []) {
  const best = chooseBestCandidate(candidates, slug);

  const sourceAudit = candidates.map(c => ({
    type: c?.type || "unknown",
    label: c?.label || "unknown",
    ok: !!c?.ok
  }));

  if (!best) {
    return {
      league: slug,
      confidence: 0,
      completeness: 0,
      chosenType: null,
      sourceAudit,
      phases: {},
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

  const normalizedPhases = Object.fromEntries(
    Object.entries(best?.phases || {}).map(([phase, rows]) => [
      phase,
      safeArray(rows)
        .map((row, idx) => normalizeStandingsRow(row, idx))
        .filter(row => !!normalizeText(row.team || row.teamName || row.name))
        .sort((a, b) => {
          const pa = toNumber(a.position, 999);
          const pb = toNumber(b.position, 999);
          return pa - pb;
        })
    ])
  );

  const scored = scoreStandingsConfidence(
    normalized,
    slug,
    Number(best.confidence) || 0.8
  );

  // if table is too weak/incomplete, do not expose it as active league state
  const MIN_CONFIDENCE = 0.4;

  if (scored.confidence < MIN_CONFIDENCE) {
    return {
      league: slug,
      confidence: scored.confidence,
      completeness: scored.completeness,
      chosenType: best?.type || null,
      sourceAudit: [
        ...sourceAudit,
        {
          type: "validation",
          label: `low-confidence:${scored.confidence.toFixed(2)}`,
          ok: false
        }
      ],
      phases: normalizedPhases,
      table: []
    };
  }

  const enrichedTable = normalized.map(row => ({
    ...row,
    confidence: scored.confidence
  }));

  const enrichedPhases = Object.fromEntries(
    Object.entries(normalizedPhases).map(([phase, rows]) => [
      phase,
      rows.map(row => ({
        ...row,
        confidence: scored.confidence
      }))
    ])
  );

  return {
    league: slug,
    confidence: scored.confidence,
    completeness: scored.completeness,
    chosenType: best?.type || null,
    sourceAudit: [
      ...sourceAudit,
      {
        type: "validation",
        label: `rows:${scored.rowCount}/${scored.expectedSize}`,
        ok: true
      }
    ],
    phases: enrichedPhases,
    table: enrichedTable
  };
}

function writeLeagueStandingsArtifact(slug, state) {
  const outDir = resolveDataPath("standings");
  ensureDir(outDir);

  const filePath = path.join(outDir, `${slug}.json`);

  const phaseTables =
    state?.phases && typeof state.phases === "object"
      ? state.phases
      : {};

  const phaseKeys = Object.keys(phaseTables);

  const payload = {
    league: slug,
    updatedAt: Date.now(),

    confidence: Number(state?.confidence) || 0,
    completeness: Number(state?.completeness) || 0,

    sourceAudit: safeArray(state?.sourceAudit),

    // 🔥 NEW STANDARD FORMAT
    phaseSummary: {
      hasPhaseTables: phaseKeys.length > 1,
      phaseKeys
    },

    phaseTables,

    // backward compatibility
    phases: phaseTables,

    table: safeArray(state?.table)
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    filePath,
    rowsCount: payload.table.length
  };
}

export async function buildStandingsDay(dayKey, leagues = [], options = {}) {
  if (!Array.isArray(leagues) || leagues.length === 0) {
    try {
      const historyRows = getCurrentSeasonHistoryRows(String(options.season || DEFAULT_SEASON));

      const slugs = Array.from(
        new Set(
          safeArray(historyRows)
            .map(row => getLeagueSlugFromRow(row))
            .filter(Boolean)
        )
      );

      leagues = slugs.map(slug => ({ slug }));
    } catch (err) {
      console.warn("[buildStandingsDay] failed to derive leagues from history:",   err.message);
      leagues = [];
    }
  }
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

      // Sync fresh local-history truth back into league-memory so assessment
      // and odds attribution (which read that store) see the same table as
      // details. Only when local truth WON the reconciliation — a table that
      // came FROM league-memory or from a previous artifact carries no new
      // information and must not overwrite scraped provenance (source/url).
      // recordStandingsResult itself guards against clobbering a newer season
      // or a higher-confidence accepted table.
      let memorySync = null;
      if (
        state?.chosenType === "local_truth_history" &&
        safeArray(state?.table).length > 0 &&
        (Number(state?.confidence) || 0) > 0
      ) {
        try {
          const leagueSeason = currentSeasonLabel(slug, getLeagueMeta(slug));
          const rows = state.table.map(row => ({
            ...row,
            goalDifference: toNumber(row?.goalDifference, toNumber(row?.goalDiff, 0))
          }));

          memorySync = recordStandingsResult(slug, {
            status: "accepted",
            season: leagueSeason,
            source: "daily-standings-build",
            confidence: Number(state.confidence) || 0,
            rowCount: rows.length,
            rows
          });
        } catch (e) {
          memorySync = { written: false, reason: e?.message || "memory_sync_failed" };
        }
      }

      results.push({
        league: slug,
        ok: true,
        found: written.rowsCount > 0,
        rowsCount: written.rowsCount,
        confidence: Number(state?.confidence) || 0,
        source: state?.chosenType || null,
        memorySync: memorySync
          ? { written: !!memorySync.written, reason: memorySync.reason || null }
          : null
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