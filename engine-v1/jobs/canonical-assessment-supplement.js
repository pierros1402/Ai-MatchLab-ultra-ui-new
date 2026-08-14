/**
 * Canonical-day model-assessment supplement.
 *
 * This is not an odds source. It ensures that upcoming canonical fixtures can
 * receive the same Poisson aiAssessment used by the autonomous odds-opening
 * path when the live fixture/odds feed is temporarily incomplete.
 *
 * Safety: canonical identity drives membership; trusted standings drive the
 * model; already-started fixtures are never newly assessed; bookmaker odds are
 * never fabricated or replaced.
 */

import fs from "fs";

import { resolveDataPath } from "../storage/data-root.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { recordOddsSnapshot } from "../storage/odds-memory-db.js";
import { priceMatchFromStandings } from "../odds/ai-odds-model.js";
import { teamFormRates } from "../storage/results-memory-db.js";
import { teamXgRates } from "../storage/discipline-memory-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { normalizeTeamKey as normalizeTeam } from "../core/normalize.js";
import { findTeam } from "../odds/team-league-index.js";

export function readCanonicalFixtureDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort();
  } catch {
    return [];
  }

  const byId = new Map();
  for (const name of files) {
    let doc = null;
    try {
      doc = JSON.parse(fs.readFileSync(resolveDataPath("canonical-fixtures", dayKey, name), "utf8"));
    } catch {
      continue;
    }
    const rows = Array.isArray(doc?.fixtures) ? doc.fixtures : [];
    for (const row of rows) {
      const id = row?.canonicalId || row?.matchId || null;
      if (!id) continue;
      if (row?.dayKey && row.dayKey !== dayKey) continue;
      byId.set(id, row);
    }
  }
  return [...byId.values()];
}

function leagueTeamIndex(slug, standingsDoc, resolveAliases, normalize) {
  const rows = standingsDoc?.accepted?.rows;
  if (!Array.isArray(rows) || rows.length < 4) return null;

  const teams = [];
  let goalsFor = 0;
  let played = 0;
  for (const row of rows) {
    goalsFor += Number(row?.goalsFor) || 0;
    played += Number(row?.played) || 0;
    for (const candidate of resolveAliases(slug, row?.teamName)) {
      const norm = normalize(candidate);
      if (norm) teams.push({ norm, row });
    }
  }

  return {
    teams,
    leagueAvg: played > 0 ? goalsFor / played : 1.35
  };
}

function kickoffHasStarted(fixture, nowMs) {
  const kickoffMs = Date.parse(fixture?.kickoffUtc || "");
  return Number.isFinite(kickoffMs) && kickoffMs <= nowMs;
}

export function supplementCanonicalAssessments(dayKey, options = {}) {
  const fixtures = Array.isArray(options.canonicalFixtures)
    ? options.canonicalFixtures
    : readCanonicalFixtureDay(dayKey);

  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const readStandingsFn = options.readStandingsFn || readStandings;
  const resolveAliasesFn = options.resolveAliasesFn || resolveAliasCandidates;
  const normalizeFn = options.normalizeFn || normalizeTeam;
  const findTeamFn = options.findTeamFn || findTeam;
  const priceFn = options.priceFn || priceMatchFromStandings;
  const formFn = options.formFn || teamFormRates;
  const xgFn = options.xgFn || teamXgRates;
  const recordFn = options.recordFn || recordOddsSnapshot;

  const leagueCache = new Map();
  const summary = {
    dayKey,
    canonicalFixtures: fixtures.length,
    eligibleUpcomingFixtures: 0,
    assessmentRowsWritten: 0,
    skippedStarted: 0,
    skippedMissingIdentity: 0,
    skippedMissingStandings: 0,
    skippedTeamResolution: 0,
    skippedEmptyAssessment: 0
  };

  for (const fixture of fixtures) {
    const canonicalId = fixture?.canonicalId || fixture?.matchId || null;
    const leagueSlug = fixture?.leagueSlug || null;
    const home = fixture?.homeTeam || fixture?.home || null;
    const away = fixture?.awayTeam || fixture?.away || null;

    if (!canonicalId || !leagueSlug || !home || !away) {
      summary.skippedMissingIdentity++;
      continue;
    }
    if (kickoffHasStarted(fixture, nowMs)) {
      summary.skippedStarted++;
      continue;
    }

    summary.eligibleUpcomingFixtures++;

    if (!leagueCache.has(leagueSlug)) {
      const standingsDoc = readStandingsFn(leagueSlug);
      leagueCache.set(
        leagueSlug,
        leagueTeamIndex(leagueSlug, standingsDoc, resolveAliasesFn, normalizeFn)
      );
    }

    const league = leagueCache.get(leagueSlug);
    if (!league) {
      summary.skippedMissingStandings++;
      continue;
    }

    const homeHit = findTeamFn(home, league.teams);
    const awayHit = findTeamFn(away, league.teams);
    if (!homeHit || !awayHit) {
      summary.skippedTeamResolution++;
      continue;
    }

    const priced = priceFn(homeHit.row, awayHit.row, {
      leagueAvgGoalsPerTeam: league.leagueAvg,
      homeForm: formFn(leagueSlug, home),
      awayForm: formFn(leagueSlug, away),
      homeXg: xgFn(leagueSlug, home),
      awayXg: xgFn(leagueSlug, away)
    });

    const markets = priced?.markets;
    if (!markets || typeof markets !== "object" || Object.keys(markets).length === 0) {
      summary.skippedEmptyAssessment++;
      continue;
    }

    recordFn(
      canonicalId,
      {
        canonicalId,
        leagueSlug,
        competition: fixture?.leagueName || fixture?.competition || null,
        home,
        away,
        dayKey,
        kickoffUtc: fixture?.kickoffUtc || null,
        aiAssessment: {
          model: priced?.model || null,
          markets,
          inputSource: "canonical_fixture_trusted_standings"
        }
      },
      { markets: {} }
    );
    summary.assessmentRowsWritten++;
  }

  return summary;
}
