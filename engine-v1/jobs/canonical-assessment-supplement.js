/**
 * Canonical-day model-assessment supplement.
 *
 * This is not an odds source. It ensures that upcoming canonical fixtures can
 * receive the same Poisson aiAssessment used by the autonomous odds-opening
 * path when the live fixture/odds feed is temporarily incomplete.
 *
 * Safety: canonical identity drives membership; trusted standings are preferred.
 * When trusted standings are unavailable, a model-only fallback is allowed only
 * when BOTH teams have a full six-match recent-form sample. xG may enrich that
 * evidence but never substitutes for the six-match form threshold. Already-started
 * fixtures are never newly assessed; bookmaker odds are never fabricated/replaced.
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

function kickoffTimestamp(fixture) {
  const kickoffUtc = fixture?.kickoffUtc;
  if (
    typeof kickoffUtc !== "string" ||
    !kickoffUtc.trim() ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(kickoffUtc)
  ) {
    return null;
  }
  const kickoffMs = Date.parse(kickoffUtc);
  return Number.isFinite(kickoffMs) ? kickoffMs : null;
}

const MIN_FALLBACK_FORM_SAMPLE = 6;

function uniqueEvidenceNames(slug, teamName, resolveAliases) {
  const out = [];
  const seen = new Set();
  const aliases = resolveAliases(slug, teamName);
  const values = [
    teamName,
    ...(Array.isArray(aliases) ? aliases : [])
  ];

  for (const value of values) {
    const name = String(value || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }

  return out;
}

function bestTeamEvidence(slug, teamName, resolveAliases, formFn, xgFn) {
  let best = {
    name: String(teamName || "").trim(),
    form: { sample: 0, gfRate: null, gaRate: null, ppg: null },
    xg: { sample: 0, xgForRate: null, xgAgainstRate: null },
    formSample: 0,
    xgSample: 0
  };

  for (const name of uniqueEvidenceNames(slug, teamName, resolveAliases)) {
    const form = formFn(slug, name) || {};
    const xg = xgFn(slug, name) || {};
    const formSample = Number(form?.sample) || 0;
    const xgSample = Number(xg?.sample) || 0;

    if (
      formSample > best.formSample ||
      (formSample === best.formSample && xgSample > best.xgSample)
    ) {
      best = { name, form, xg, formSample, xgSample };
    }
  }

  return best;
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
    assessmentRowsFromTrustedStandings: 0,
    assessmentRowsFromTeamFormFallback: 0,
    skippedInvalidKickoff: 0,
    skippedStarted: 0,
    skippedMissingIdentity: 0,
    skippedMissingStandings: 0,
    skippedTeamResolution: 0,
    skippedInsufficientTeamEvidence: 0,
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
    const kickoffMs = kickoffTimestamp(fixture);
    if (kickoffMs === null) {
      summary.skippedInvalidKickoff++;
      continue;
    }
    if (kickoffMs <= nowMs) {
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
    const homeHit = league ? findTeamFn(home, league.teams) : null;
    const awayHit = league ? findTeamFn(away, league.teams) : null;

    const homeEvidence = bestTeamEvidence(
      leagueSlug,
      home,
      resolveAliasesFn,
      formFn,
      xgFn
    );
    const awayEvidence = bestTeamEvidence(
      leagueSlug,
      away,
      resolveAliasesFn,
      formFn,
      xgFn
    );

    let priced = null;
    let assessmentPath = null;

    if (league && homeHit && awayHit) {
      priced = priceFn(homeHit.row, awayHit.row, {
        leagueAvgGoalsPerTeam: league.leagueAvg,
        homeForm: homeEvidence.form,
        awayForm: awayEvidence.form,
        homeXg: homeEvidence.xg,
        awayXg: awayEvidence.xg
      });
      assessmentPath = "trusted_standings";
    } else {
      const fallbackEligible =
        homeEvidence.formSample >= MIN_FALLBACK_FORM_SAMPLE &&
        awayEvidence.formSample >= MIN_FALLBACK_FORM_SAMPLE;

      if (!fallbackEligible) {
        if (!league) summary.skippedMissingStandings++;
        else summary.skippedTeamResolution++;
        summary.skippedInsufficientTeamEvidence++;
        continue;
      }

      priced = priceFn({}, {}, {
        leagueAvgGoalsPerTeam: 1.35,
        homeForm: homeEvidence.form,
        awayForm: awayEvidence.form,
        homeXg: homeEvidence.xg,
        awayXg: awayEvidence.xg
      });
      assessmentPath = "team_form_fallback";
    }

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
          model: assessmentPath === "team_form_fallback"
            ? {
                ...(priced?.model || {}),
                source: priced?.model?.xgUsed
                  ? "ai_poisson_team_form_xg_fallback"
                  : "ai_poisson_team_form_fallback",
                trustedStandingsUsed: false,
                minimumFormSamplePerSide: MIN_FALLBACK_FORM_SAMPLE
              }
            : priced?.model
              ? {
                  ...priced.model,
                  trustedStandingsUsed: true
                }
              : null,
          markets,
          inputSource: assessmentPath === "team_form_fallback"
            ? "canonical_fixture_team_form_fallback"
            : "canonical_fixture_trusted_standings"
        }
      },
      { markets: {} }
    );

    summary.assessmentRowsWritten++;
    if (assessmentPath === "team_form_fallback") {
      summary.assessmentRowsFromTeamFormFallback++;
    } else {
      summary.assessmentRowsFromTrustedStandings++;
    }
  }

  return summary;
}
