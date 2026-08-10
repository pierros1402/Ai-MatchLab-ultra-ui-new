import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { sameTeamName } from "../core/fixture-dedup.js";
import {
  classifyMatchState,
  MATCH_STATE_CLASS
} from "../core/non-played-state.js";

const HISTORY_DIR = ensureDir(resolveDataPath("history"));

// Season attribution MUST match core/season.js (rollover = 1 August).
function resolveSeasonFromDay(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);
  if (!year || !month) return "unknown-season";
  return currentSeason(new Date(Date.UTC(year, month - 1, day || 1)));
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function finalScoreOf(row) {
  const homeCandidates = [
    row?.homeScore,
    row?.scoreHome,
    row?.finalScore?.homeScore,
    row?.finalScore?.home
  ].filter(value => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""));
  const awayCandidates = [
    row?.awayScore,
    row?.scoreAway,
    row?.finalScore?.awayScore,
    row?.finalScore?.away
  ].filter(value => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === ""));

  if (!homeCandidates.length || !awayCandidates.length) return null;
  const home = homeCandidates.map(strictScore);
  const away = awayCandidates.map(strictScore);
  if (home.some(value => value === null) || away.some(value => value === null)) return null;
  if (new Set(home).size !== 1 || new Set(away).size !== 1) return null;
  return { home: home[0], away: away[0] };
}

function hasVerifiedFinalVerdict(row) {
  if (row?.verifiedFinalTruth !== true) return false;
  const verdicts = [
    row?.finalTruthVerdict,
    row?.verdict,
    row?.verification?.finalTruthVerdict,
    row?.verification?.verdict,
    row?.verification?.state,
    row?.settlement?.finalTruthVerdict,
    row?.settlement?.state
  ].map(value => clean(value).toLowerCase()).filter(Boolean);

  return verdicts.some(value => [
    "verified_final_result",
    "verified_final_result_truth",
    "manual_two_source_final_score_validated",
    "manual_official_url_validated"
  ].includes(value));
}

function rowDay(row) {
  const explicit = clean(row?.dayKey || row?.date);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(explicit)) return explicit;
  const kickoff = clean(row?.kickoffUtc || row?.kickoff || row?.startUtc || row?.startTime);
  if (!kickoff) return "";
  try {
    return athensDayFromKickoff(new Date(kickoff).toISOString());
  } catch {
    return "";
  }
}

function terminalHistoryStatus(row) {
  const status = clean(row?.status).toUpperCase();
  if (status === "AET" || status === "PEN") return status;
  return "FT";
}

function outcome(home, away) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function normalizeHistoryDays(history) {
  const rawDays = history?.days;
  if (!Array.isArray(rawDays)) return [];
  return rawDays
    .map(day => ({
      dayKey: clean(day?.dayKey),
      matchCount: Array.isArray(day?.rows) ? day.rows.length : 0,
      rows: Array.isArray(day?.rows) ? day.rows : [],
      updatedAt: day?.updatedAt || Date.now()
    }))
    .filter(day => /^\d{4}-\d{2}-\d{2}$/u.test(day.dayKey))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

export function buildVerifiedHistoryDay({
  dayKey,
  canonicalRows = [],
  finalResultRows = [],
  season = resolveSeasonFromDay(dayKey),
  rebuiltAt = Date.now()
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const errors = [];
  const canonicalById = new Map();
  const finalById = new Map();

  for (const row of canonicalRows) {
    const id = clean(row?.canonicalId);
    if (!id) {
      errors.push({ reason: "canonical_id_required" });
      continue;
    }
    if (canonicalById.has(id)) {
      errors.push({ reason: "canonical_identity_duplicate", matchId: id });
      continue;
    }
    if (rowDay(row) !== dayKey) {
      errors.push({ reason: "canonical_day_mismatch", matchId: id, actualDay: rowDay(row) || null });
      continue;
    }
    canonicalById.set(id, row);
  }

  for (const row of finalResultRows) {
    const id = clean(row?.matchId);
    if (!id) {
      errors.push({ reason: "verified_final_match_id_required" });
      continue;
    }
    if (!hasVerifiedFinalVerdict(row)) {
      errors.push({ reason: "verified_final_contract_required", matchId: id });
      continue;
    }
    if (rowDay(row) !== dayKey) {
      errors.push({ reason: "verified_final_day_mismatch", matchId: id, actualDay: rowDay(row) || null });
      continue;
    }
    const score = finalScoreOf(row);
    if (!score) {
      errors.push({ reason: "verified_final_numeric_score_required", matchId: id });
      continue;
    }
    if (finalById.has(id)) {
      errors.push({ reason: "verified_final_identity_duplicate", matchId: id });
      continue;
    }
    finalById.set(id, { row, score });
  }

  const rows = [];
  let canonicalPlayedFinalCount = 0;

  for (const [id, canonical] of canonicalById) {
    const state = classifyMatchState(canonical);
    const final = finalById.get(id) || null;

    if (state === MATCH_STATE_CLASS.CONFLICT) {
      errors.push({ reason: "canonical_status_conflict", matchId: id });
      continue;
    }

    if (state !== MATCH_STATE_CLASS.PLAYED_FINAL) {
      if (final) {
        errors.push({
          reason: "verified_final_canonical_nonterminal",
          matchId: id,
          canonicalState: state
        });
      }
      continue;
    }

    canonicalPlayedFinalCount += 1;

    if (!final) {
      errors.push({ reason: "canonical_final_missing_verified_final", matchId: id });
      continue;
    }

    const canonicalHome = strictScore(canonical?.scoreHome);
    const canonicalAway = strictScore(canonical?.scoreAway);
    if (canonicalHome === null || canonicalAway === null) {
      errors.push({ reason: "canonical_final_numeric_score_required", matchId: id });
      continue;
    }
    if (canonicalHome !== final.score.home || canonicalAway !== final.score.away) {
      errors.push({
        reason: "canonical_verified_final_score_mismatch",
        matchId: id,
        canonicalScore: `${canonicalHome}-${canonicalAway}`,
        verifiedFinalScore: `${final.score.home}-${final.score.away}`
      });
      continue;
    }

    const finalHomeTeam = clean(final.row?.homeTeam || final.row?.teams?.homeTeam);
    const finalAwayTeam = clean(final.row?.awayTeam || final.row?.teams?.awayTeam);
    const slug = clean(canonical?.leagueSlug || final.row?.leagueSlug);
    // Exact match-id parity is already required above. Provider display aliases
    // are accepted only when the conservative name matcher agrees in either
    // direction; some legacy abbreviation comparisons are order-sensitive.
    const homeTeamMatches =
      sameTeamName(slug, canonical?.homeTeam, finalHomeTeam) ||
      sameTeamName(slug, finalHomeTeam, canonical?.homeTeam);
    const awayTeamMatches =
      sameTeamName(slug, canonical?.awayTeam, finalAwayTeam) ||
      sameTeamName(slug, finalAwayTeam, canonical?.awayTeam);
    if (!homeTeamMatches || !awayTeamMatches) {
      errors.push({ reason: "canonical_verified_final_team_mismatch", matchId: id });
      continue;
    }

    const kickoff = canonical?.kickoffUtc || canonical?.kickoff || final.row?.kickoffUtc || final.row?.kickoff || null;
    const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
    if (!Number.isFinite(kickoffMs)) {
      errors.push({ reason: "canonical_kickoff_required", matchId: id });
      continue;
    }

    rows.push({
      id,
      season,
      dayKey,
      kickoff,
      kickoff_ms: kickoffMs,
      leagueSlug: clean(canonical?.leagueSlug || final.row?.leagueSlug),
      leagueName: clean(canonical?.leagueName || final.row?.leagueName),
      homeTeam: clean(canonical?.homeTeam),
      awayTeam: clean(canonical?.awayTeam),
      scoreHome: final.score.home,
      scoreAway: final.score.away,
      status: terminalHistoryStatus(canonical),
      minute: canonical?.minute || "FT",
      outcome: outcome(final.score.home, final.score.away),
      source: clean(final.row?.source) || "verified-final",
      rebuiltAt,
      competitionType: canonical?.competitionType || null,
      leagueTier: canonical?.leagueTier ?? null,
      leagueTrust: canonical?.leagueTrust ?? null,
      phase: canonical?.phase || "regular",
      truthContract: {
        schema: "ai-matchlab.history-verified-final-parity.v1",
        canonicalIdExact: true,
        athensDayExact: true,
        orderedTeamPairMatched: true,
        canonicalPlayedTerminal: true,
        exactScoreParity: true,
        verifiedFinalTruth: true,
        nullScoreCoercionForbidden: true
      }
    });
  }

  for (const id of finalById.keys()) {
    if (!canonicalById.has(id)) {
      errors.push({ reason: "verified_final_missing_canonical_fixture", matchId: id });
    }
  }

  rows.sort((a, b) => {
    if (a.kickoff_ms !== b.kickoff_ms) return a.kickoff_ms - b.kickoff_ms;
    return a.id.localeCompare(b.id);
  });

  return {
    ok: errors.length === 0 && rows.length > 0,
    reason: errors.length ? "history_truth_parity_failed" : rows.length ? null : "no_verified_terminal_rows",
    dayKey,
    season,
    canonicalFixtureCount: canonicalById.size,
    canonicalPlayedFinalCount,
    verifiedFinalCount: finalById.size,
    acceptedRows: rows.length,
    errors,
    rows
  };
}

function loadFinalResultRows(dayKey) {
  const dir = resolveDataPath("final-results", dayKey);
  if (!fsSync.existsSync(dir)) return { dir, rows: [], readErrors: [] };

  const rows = [];
  const readErrors = [];
  for (const name of fsSync.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const file = path.join(dir, name);
    try {
      rows.push(JSON.parse(fsSync.readFileSync(file, "utf8")));
    } catch (error) {
      readErrors.push({ file, reason: error?.message || "final_result_json_read_failed" });
    }
  }
  return { dir, rows, readErrors };
}

export function buildHistoryDayFromTruth(dayKey) {
  const canonicalRows = canonicalFixturesForDay(dayKey);
  const finals = loadFinalResultRows(dayKey);
  if (finals.readErrors.length) {
    return {
      ok: false,
      reason: "verified_final_artifact_read_failed",
      dayKey,
      errors: finals.readErrors,
      rows: []
    };
  }
  return buildVerifiedHistoryDay({
    dayKey,
    canonicalRows,
    finalResultRows: finals.rows
  });
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export async function appendFinalizedDayToHistory(dayKey) {
  const build = buildHistoryDayFromTruth(dayKey);
  if (!build.ok) return build;

  const season = build.season;
  const historyPath = resolveDataPath("history", `${season}.json`);
  const existingHistory = await readJsonSafe(historyPath, { season, days: [] });
  const days = normalizeHistoryDays(existingHistory);
  const existingIndex = days.findIndex(day => day.dayKey === dayKey);

  const dayPayload = {
    dayKey,
    matchCount: build.rows.length,
    rows: build.rows,
    updatedAt: Date.now()
  };

  // Replace the whole day atomically. Incremental merge is forbidden: stale
  // rows from a previously corrupted truth snapshot must not survive a rerun.
  if (existingIndex >= 0) days[existingIndex] = dayPayload;
  else days.push(dayPayload);
  days.sort((a, b) => a.dayKey.localeCompare(b.dayKey));

  const output = { season, days };
  await writeJsonAtomic(historyPath, output);

  return {
    ...build,
    historyPath,
    rowsWritten: build.rows.length,
    replacedWholeDay: true,
    atomicWrite: true
  };
}
