import fsSync from "node:fs";
import path from "node:path";

import { atomicArtifact, journalHistoryBuild, readOptional, withArtifactLock } from "../storage/evidence-bound-history-store.js";
import { fingerprint } from "../core/season-closure-contract.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { sameTeamName } from "../core/fixture-dedup.js";
import { sameSquadMarkers } from "../core/team-identity.js";
import { getProductionIdentityResolver } from "../core/production-identity-resolver-runtime.js";
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
  const rawStatus = clean(row?.rawStatus).toUpperCase();
  if (rawStatus === "STATUS_FINAL_AET") return "AET";
  if (rawStatus === "STATUS_FINAL_PEN") return "PEN";
  return "FT";
}

function outcome(home, away) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function verifiedHistoryTeamNameMatches(slug, canonicalName, finalName, identityResolver) {
  if (!sameSquadMarkers(canonicalName, finalName)) return false;
  // Resolve complete original names before legacy qualifier stripping. A
  // location such as (Jujuy) is part of the finalized exact club identity.
  const canonical = identityResolver.resolveTeamReference({ leagueSlug: slug, alias: canonicalName });
  const final = identityResolver.resolveTeamReference({ leagueSlug: slug, alias: finalName });
  if (canonical?.ok && final?.ok) return Boolean(clean(canonical.globalClubId)) && clean(canonical.globalClubId) === clean(final.globalClubId);
  return sameTeamName(slug, canonicalName, finalName) || sameTeamName(slug, finalName, canonicalName);
}

export function buildVerifiedHistoryDay({
  dayKey,
  canonicalRows = [],
  finalResultRows = [],
  season = resolveSeasonFromDay(dayKey),
  rebuiltAt = Date.now(),
  identityResolver = getProductionIdentityResolver()
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
    // use exact finalized identities, or the conservative name matcher in either
    // direction; some legacy abbreviation comparisons are order-sensitive.
    const homeTeamMatches =
      verifiedHistoryTeamNameMatches(slug, canonical?.homeTeam, finalHomeTeam, identityResolver);
    const awayTeamMatches =
      verifiedHistoryTeamNameMatches(slug, canonical?.awayTeam, finalAwayTeam, identityResolver);
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

function sameHistoryFact(a, b) {
  const facts = row => [row.id, row.dayKey, row.leagueSlug, row.kickoff_ms, row.homeTeam,
    row.awayTeam, row.scoreHome, row.scoreAway, row.status];
  return fingerprint(facts(a)) === fingerprint(facts(b));
}

export async function persistVerifiedHistoryBuild(build, { journalRoot, historyPath }) {
  const recovery = await journalHistoryBuild(journalRoot, build);
  if (!build.ok) return { ...build, recovery };
  const result = await withArtifactLock(historyPath + ".lock", async () => {
    const raw = await readOptional(historyPath);
    let existing;
    try {
      existing = raw === null ? { season: build.season, days: [] } : JSON.parse(raw);
    } catch {
      return { ok: false, reason: "history_store_unreadable" };
    }
    if (existing?.season !== build.season || !Array.isArray(existing?.days) ||
        existing.days.some(day => !day || !Array.isArray(day.rows) || !/^\d{4}-\d{2}-\d{2}$/u.test(day.dayKey)) ||
        new Set(existing.days.map(day => day.dayKey)).size !== existing.days.length) {
      return { ok: false, reason: "history_store_shape_conflict" };
    }

    const index = existing.days.findIndex(day => day.dayKey === build.dayKey);
    const previous = existing.days[index];
    const proposed = new Map(build.rows.map(row => [row.id, row]));
    const priorRows = previous?.rows ?? [];
    if (proposed.size !== build.rows.length ||
        existing.days.some(day => day.dayKey !== build.dayKey && day.rows.some(row => proposed.has(row.id))) ||
        new Set(priorRows.map(row => row.id)).size !== priorRows.length ||
        priorRows.some(row => !proposed.has(row.id) || !sameHistoryFact(row, proposed.get(row.id)))) {
      return { ok: false, reason: "history_review_required" };
    }
    if (priorRows.length === proposed.size) return { ok: true, unchanged: true, rowsWritten: 0 };

    const stored = new Map(priorRows.map(row => [row.id, row]));
    const days = [...existing.days];
    const rows = build.rows.map(row => stored.get(row.id) ?? row);
    const payload = { ...previous, dayKey: build.dayKey, matchCount: rows.length, rows, updatedAt: Date.now() };
    if (index === -1) days.push(payload);
    else days[index] = payload;
    days.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    await atomicArtifact(historyPath, JSON.stringify({ ...existing, days }, null, 2) + "\n");
    return { ok: true, rowsWritten: rows.length - priorRows.length, atomicWrite: true };
  });
  if (!result.ok) {
    const hold = await journalHistoryBuild(journalRoot, { ...build, ...result });
    return { ...build, ...result, historyPath, recovery: hold };
  }
  return { ...build, ...result, historyPath, recovery };
}

export async function appendFinalizedDayToHistory(dayKey) {
  const build = buildHistoryDayFromTruth(dayKey);
  return persistVerifiedHistoryBuild(build, {
    journalRoot: resolveDataPath("history-recovery-journal"),
    historyPath: resolveDataPath("history", build.season + ".json")
  });
}
