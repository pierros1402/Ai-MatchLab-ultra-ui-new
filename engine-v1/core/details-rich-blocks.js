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
import { computeMatchdayAxis, isLeagueIntegrityGreen } from "./matchday-axis.js";

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

/**
 * H2H block: recent meetings (most recent first) plus a W/D/L summary from the
 * home team's perspective. Limited to `limit` matches for payload size.
 */
export function buildH2HBlock(homeTeam, awayTeam, limit = 10) {
  const h2h = getH2HForMatch(homeTeam, awayTeam);
  if (!h2h || !Array.isArray(h2h.all) || !h2h.all.length) {
    return { status: "empty", homeTeam, awayTeam, summary: null, matches: [] };
  }
  const matches = [...h2h.all]
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
    summary: h2h.summary?.all || null,
    totalMeetings: h2h.all.length,
    matches
  };
}

/**
 * Standings block: the full validated table, but ONLY when league integrity is
 * green. A red/anomalous league returns a gated stub carrying the reason so the
 * UI can explain the absence rather than showing a wrong table.
 */
export function buildStandingsBlock(leagueSlug) {
  if (!leagueSlug) return { status: "empty", reason: "no_league", rows: [] };

  const axis = computeMatchdayAxis(leagueSlug);
  if (!isLeagueIntegrityGreen(leagueSlug)) {
    return {
      status: "gated",
      reason: axis.matchdayAnomaly?.reason || "integrity_not_green",
      matchday: axis.matchday ?? null,
      rows: []
    };
  }

  const rows = readStandings(leagueSlug)?.accepted?.rows || [];
  return {
    status: rows.length ? "ready" : "empty",
    leagueSlug,
    matchday: axis.matchday ?? null,
    updatedAt: readStandings(leagueSlug)?.accepted?.fetchedAt || null,
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
 * Assemble all three rich blocks for a match. Single entry point the details
 * builder calls; keeps the gating rule in one place.
 */
export function buildRichContextBlocks(match) {
  const home = match?.homeTeam || null;
  const away = match?.awayTeam || null;
  const slug = match?.leagueSlug || null;
  const season = currentSeason();
  return {
    standings: buildStandingsBlock(slug),
    form: buildFormBlock(home, away, season),
    h2h: buildH2HBlock(home, away)
  };
}
