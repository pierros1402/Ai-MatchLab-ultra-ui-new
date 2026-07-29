/**
 * details-rich-blocks.js
 *
 * Flashscore-style rich context for a match details payload — standings table,
 * recent form, and head-to-head — assembled ENTIRELY from data we already hold
 * (validated standings + history-index/team-form + h2h memory). No new API, no
 * scrape, and no touch of the value engine (value logic is frozen).
 *
 * Fail-closed gating: the full STANDINGS TABLE is only surfaced when the league
 * integrity axis is green (validated standings + trustworthy matchday + no
 * anomaly), so a corrupt/cumulative table (blr.1 & co.) never reaches the UI.
 * Form and H2H come from independent per-team / per-pair history and carry their
 * own presence checks, so they are safe to include regardless.
 */

import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { getH2HForMatch } from "../storage/h2h-memory-db.js";
import { normalizeTeamKey } from "./normalize.js";
import { currentSeason } from "./season.js";
import { isLeagueIntegrityGreen, isKnownNonLeagueCompetition } from "./matchday-axis.js";
import { loadOpponentAdjustedProfiles } from "./opponent-strength-profile-loader.js";
import { describeProbabilityAdjustment } from "./opponent-strength-adjusted-form.js";

// ── team-form index (season-scoped, read once per process) ───────────────────

let _teamFormCache = null;
let _teamFormSeason = null;

function loadTeamFormIndex(season = currentSeason()) {
  if (_teamFormCache && _teamFormSeason === season) return _teamFormCache;
  const file = resolveDataPath("history-index", "team-form", `${season}.json`);
  try {
    _teamFormCache = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    _teamFormCache = {};
  }
  _teamFormSeason = season;
  return _teamFormCache;
}

/** Resolve a team's form entry by exact name, then normalized-key fallback. */
function resolveTeamForm(index, teamName) {
  if (!teamName || !index) return null;
  if (index[teamName]) return index[teamName];
  const target = normalizeTeamKey(teamName);
  for (const [key, value] of Object.entries(index)) {
    if (normalizeTeamKey(key) === target) return value;
  }
  return null;
}

function compactForm(entry) {
  if (!entry) return null;
  const pick = w => w ? {
    played: w.played ?? 0,
    wins: w.wins ?? 0,
    draws: w.draws ?? 0,
    losses: w.losses ?? 0,
    gf: w.gf ?? 0,
    ga: w.ga ?? 0,
    points: w.points ?? 0,
    ppg: Number.isFinite(w.ppg) ? +w.ppg.toFixed(2) : null
  } : null;
  return {
    team: entry.team || null,
    total: pick(entry.total),
    last5: pick(entry.last5),
    last10: pick(entry.last10),
    homeLast5: pick(entry.homeLast5),
    awayLast5: pick(entry.awayLast5)
  };
}

/**
 * Form block: last5 / last10 aggregates for both sides from the team-form index.
 * `status` is "ready" when at least one side resolved, else "empty".
 */
export function buildFormBlock(homeTeam, awayTeam, season = currentSeason()) {
  const index = loadTeamFormIndex(season);
  const home = compactForm(resolveTeamForm(index, homeTeam));
  const away = compactForm(resolveTeamForm(index, awayTeam));
  return {
    status: home || away ? "ready" : "empty",
    season,
    home,
    away
  };
}


function finiteScore(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function kickoffMs(row) {
  const direct = Number(row?.kickoff_ms);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const parsed = Date.parse(row?.kickoff || row?.kickoffUtc || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function semanticFormKey(row) {
  const day = String(row?.dayKey || row?.day || row?.date || "").slice(0, 10);
  return [
    String(row?.leagueSlug || "").toLowerCase(),
    day,
    normalizeTeamKey(row?.homeTeam),
    normalizeTeamKey(row?.awayTeam),
    finiteScore(row?.scoreHome),
    finiteScore(row?.scoreAway)
  ].join("|");
}

function isTerminalFormRow(row) {
  const status = String(row?.status || "").toUpperCase();
  return (status === "FT" || status === "FINAL" || status === "AET" || status === "PEN" ||
    status.includes("FULL_TIME") || status.includes("STATUS_FINAL") ||
    status.includes("STATUS_AET") || status.includes("STATUS_PEN")) &&
    finiteScore(row?.scoreHome) !== null && finiteScore(row?.scoreAway) !== null;
}

function formStatsForTeam(teamName, rows) {
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  const teamKey = normalizeTeamKey(teamName);
  for (const row of rows) {
    const home = normalizeTeamKey(row.homeTeam) === teamKey;
    const gf = home ? finiteScore(row.scoreHome) : finiteScore(row.scoreAway);
    const ga = home ? finiteScore(row.scoreAway) : finiteScore(row.scoreHome);
    goalsFor += gf; goalsAgainst += ga;
    if (gf > ga) wins += 1; else if (gf < ga) losses += 1; else draws += 1;
  }
  return { played: rows.length, wins, draws, losses, goalsFor, goalsAgainst, points: wins * 3 + draws };
}

export function buildLeagueFormTable(leagueSlug, standingsRows, fixtureKickoffUtc, season = currentSeason()) {
  if (!leagueSlug || !Array.isArray(standingsRows) || !standingsRows.length) {
    return { status: "empty", leagueSlug: leagueSlug || null, rows: [] };
  }
  const cutoff = Date.parse(fixtureKickoffUtc || "");
  const index = loadTeamFormIndex(season);
  const result = [];
  for (const standing of standingsRows) {
    const teamName = standing?.teamName;
    const entry = resolveTeamForm(index, teamName);
    const seen = new Set();
    const matches = (Array.isArray(entry?.matches) ? entry.matches : [])
      .filter(row => String(row?.leagueSlug || "") === String(leagueSlug))
      .filter(isTerminalFormRow)
      .filter(row => !Number.isFinite(cutoff) || kickoffMs(row) < cutoff)
      .sort((a, b) => kickoffMs(b) - kickoffMs(a))
      .filter(row => {
        const key = semanticFormKey(row);
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })
      .slice(0, 5);
    result.push({ teamName, ...formStatsForTeam(teamName, matches), matchCount: matches.length });
  }
  result.sort((a, b) => b.points - a.points ||
    (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor || String(a.teamName).localeCompare(String(b.teamName)));
  result.forEach((row, index) => { row.position = index + 1; });
  return { status: result.some(row => row.played > 0) ? "ready" : "empty", leagueSlug, limit: 5, cutoffUtc: fixtureKickoffUtc || null, rows: result };
}

/**
 * H2H block: recent meetings split into all / at-home / at-away, each with its
 * own W-D-L summary (from the home team's perspective) — the exact shape the
 * details-panel H2H tabs consume (all/atHome/atAway + summary.{all,atHome,atAway}).
 * getH2HForMatch already builds these; we only most-recent-sort and cap each list
 * for payload size (the summaries stay computed over the full history).
 */
export function buildH2HBlock(homeTeam, awayTeam, limit = 20) {
  const h2h = getH2HForMatch(homeTeam, awayTeam);
  if (!h2h || !Array.isArray(h2h.all) || !h2h.all.length) {
    return {
      status: "empty",
      homeTeam,
      awayTeam,
      all: [], atHome: [], atAway: [],
      summary: { all: null, atHome: null, atAway: null }
    };
  }
  const trim = list => [...(list || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
    .map(m => ({
      date: m.date || null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      scoreHome: Number.isFinite(Number(m.scoreHome)) ? Number(m.scoreHome) : null,
      scoreAway: Number.isFinite(Number(m.scoreAway)) ? Number(m.scoreAway) : null,
      competition: m.competition || null,
      leagueSlug: m.leagueSlug || null
    }));
  return {
    status: "ready",
    homeTeam,
    awayTeam,
    totalMeetings: h2h.all.length,
    all: trim(h2h.all),
    atHome: trim(h2h.atHome),
    atAway: trim(h2h.atAway),
    summary: h2h.summary || { all: null, atHome: null, atAway: null }
  };
}

/**
 * Standings block: the full validated table, but ONLY when league integrity is
 * green. A red/anomalous league returns a gated stub carrying the reason so the
 * UI can explain the absence rather than showing a wrong table.
 */
export function buildStandingsBlock(leagueSlug, match = null) {
  if (!leagueSlug) return { status: "empty", reason: "no_league", rows: [] };

  // Knockout / cup / national-team competitions have no league table. "empty"
  // (not "gated") so the UI renders nothing rather than a withheld-table notice.
  if (isKnownNonLeagueCompetition(leagueSlug)) {
    return { status: "empty", reason: "not_league_competition", rows: [] };
  }

  if (!isLeagueIntegrityGreen(leagueSlug)) {
    return {
      status: "gated",
      reason: "integrity_not_green",
      rows: []
    };
  }

  const rows = readStandings(leagueSlug)?.accepted?.rows || [];
  return {
    status: rows.length ? "ready" : "empty",
    leagueSlug,
    updatedAt: readStandings(leagueSlug)?.accepted?.fetchedAt || null,
    providerRound: match?.providerRound || null,
    rows: rows.map(r => ({
      position: r.position,
      teamName: r.teamName,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
      points: r.points
    }))
  };
}

/**
 * Additive detail block using the same opponent-strength profiles and
 * probability adjustment contract as Plan A2 and Plan B2.
 */
export function buildOpponentAdjustedFormBlock(match) {
  const homeTeam = match?.homeTeam || null;
  const awayTeam = match?.awayTeam || null;
  const leagueSlug = match?.leagueSlug || null;

  if (!homeTeam || !awayTeam || !leagueSlug) {
    return {
      status: "empty",
      reason: "missing_fixture_identity",
      leagueSlug,
      home: null,
      away: null
    };
  }

  try {
    const profiles = loadOpponentAdjustedProfiles(
      leagueSlug,
      homeTeam,
      awayTeam
    );

    const homeSample =
      Number(profiles?.home?.sample || 0);

    const awaySample =
      Number(profiles?.away?.sample || 0);

    const sampleReliability = Math.min(
      Number(
        profiles?.home?.sampleReliability || 0
      ),
      Number(
        profiles?.away?.sampleReliability || 0
      )
    );

    const status =
      homeSample > 0 && awaySample > 0
        ? "ready"
        : homeSample > 0 || awaySample > 0
          ? "partial"
          : "empty";

    return {
      schema:
        "ai-matchlab.detail-opponent-adjusted-form.v1",
      status,
      reason:
        status === "empty"
          ? "no_opponent_strength_results"
          : status === "partial"
            ? "one_side_missing_opponent_strength_results"
            : null,
      leagueSlug,
      standingsCoverage: Number(
        profiles?.standingsCoverage || 0
      ),
      homeStrength: Number(
        profiles?.homeStrength || 0
      ),
      awayStrength: Number(
        profiles?.awayStrength || 0
      ),
      sampleReliability:
        Math.round(
          sampleReliability * 1000
        ) / 1000,
      home: profiles?.home || null,
      away: profiles?.away || null,
      probabilityImpact:
        describeProbabilityAdjustment(
          profiles?.home || null,
          profiles?.away || null
        )
    };
  } catch (error) {
    return {
      status: "empty",
      reason:
        "opponent_strength_profile_load_failed",
      error: String(
        error?.message || error
      ),
      leagueSlug,
      home: null,
      away: null
    };
  }
}

/**
 * Assemble all rich context blocks for a match.
 */
export function buildRichContextBlocks(match) {
  const home = match?.homeTeam || null;
  const away = match?.awayTeam || null;
  const slug = match?.leagueSlug || null;
  const season = currentSeason();

  return {
    standings: buildStandingsBlock(slug, match),
    leagueForm5: buildLeagueFormTable(
      slug,
      readStandings(slug)?.accepted?.rows || [],
      match?.kickoffUtc || match?.kickoff || null,
      season
    ),
    form: buildFormBlock(
      home,
      away,
      season
    ),
    opponentAdjustedForm:
      buildOpponentAdjustedFormBlock(match),
    h2h: buildH2HBlock(home, away)
  };
}
