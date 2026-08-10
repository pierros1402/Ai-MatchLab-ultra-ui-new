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
import { globalCanonicalTeamName } from "../storage/team-aliases-db.js";
import { currentSeason } from "./season.js";
import { isLeagueIntegrityGreen, isKnownNonLeagueCompetition } from "./matchday-axis.js";
import { loadOpponentAdjustedProfiles } from "./opponent-strength-profile-loader.js";
import { describeProbabilityAdjustment } from "./opponent-strength-adjusted-form.js";
import {
  validateHistoryIndexFoundationSync,
  validateH2HFoundationSync,
} from "./derived-history-foundation.js";

// ── team-form index (season-scoped, read once per process) ───────────────────

let _teamFormCache = null;
let _teamFormSeason = null;
let _h2hFoundationOk = null;

function canonicalUtc(value) {
  const ts = Date.parse(value || "");
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function loadTeamFormIndex(season = currentSeason()) {
  if (_teamFormCache && _teamFormSeason === season) return _teamFormCache;
  const foundation = validateHistoryIndexFoundationSync(season);
  if (!foundation.ok) {
    _teamFormCache = {};
    _teamFormSeason = season;
    return _teamFormCache;
  }
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

function formWindowStats(teamName, rows) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;
  const teamKey = normalizeTeamKey(teamName);

  for (const row of rows) {
    const isHome = row?.isHome === true || normalizeTeamKey(row?.homeTeam) === teamKey;
    const goalsFor = isHome ? finiteScore(row?.scoreHome) : finiteScore(row?.scoreAway);
    const goalsAgainst = isHome ? finiteScore(row?.scoreAway) : finiteScore(row?.scoreHome);
    if (goalsFor === null || goalsAgainst === null) continue;
    gf += goalsFor;
    ga += goalsAgainst;
    if (goalsFor > goalsAgainst) wins += 1;
    else if (goalsFor < goalsAgainst) losses += 1;
    else draws += 1;
  }

  const played = wins + draws + losses;
  const points = wins * 3 + draws;
  return {
    played,
    wins,
    draws,
    losses,
    gf,
    ga,
    points,
    ppg: played ? points / played : 0
  };
}

export function historicalFormRowsBeforeKickoff(entry, fixtureKickoffUtc) {
  const cutoff = Date.parse(fixtureKickoffUtc || "");
  const rows = Array.isArray(entry?.matches) ? entry.matches : [];
  if (!Number.isFinite(cutoff)) return [];
  return rows
    .filter(isTerminalFormRow)
    .filter(row => {
      const ts = kickoffMs(row);
      return Number.isFinite(ts) && ts > 0 && ts < cutoff;
    })
    .sort((a, b) => kickoffMs(a) - kickoffMs(b));
}

function compactFormBeforeKickoff(entry, fixtureKickoffUtc) {
  if (!entry) return null;
  const rows = historicalFormRowsBeforeKickoff(entry, fixtureKickoffUtc);
  const team = entry.team || null;
  const homeRows = rows.filter(row => row?.isHome === true || normalizeTeamKey(row?.homeTeam) === normalizeTeamKey(team));
  const awayRows = rows.filter(row => !homeRows.includes(row));
  const last = (list, n) => list.slice(Math.max(0, list.length - n));
  return {
    team,
    total: formWindowStats(team, rows),
    last5: formWindowStats(team, last(rows, 5)),
    last10: formWindowStats(team, last(rows, 10)),
    homeLast5: formWindowStats(team, last(homeRows, 5)),
    awayLast5: formWindowStats(team, last(awayRows, 5))
  };
}

/**
 * Form block at the fixture's own kickoff. Historical details must never see
 * the fixture itself or any later result from the same season index.
 */
export function buildFormBlock(homeTeam, awayTeam, season = currentSeason(), fixtureKickoffUtc = null) {
  const index = loadTeamFormIndex(season);
  const homeEntry = resolveTeamForm(index, homeTeam);
  const awayEntry = resolveTeamForm(index, awayTeam);
  const home = fixtureKickoffUtc
    ? compactFormBeforeKickoff(homeEntry, fixtureKickoffUtc)
    : null;
  const away = fixtureKickoffUtc
    ? compactFormBeforeKickoff(awayEntry, fixtureKickoffUtc)
    : null;
  return {
    status: home || away ? "ready" : "empty",
    season,
    cutoffUtc: fixtureKickoffUtc || null,
    home,
    away
  };
}

function finiteScore(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
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
    return {
      status: "empty",
      leagueSlug: leagueSlug || null,
      limit: 5,
      cutoffUtc: canonicalUtc(fixtureKickoffUtc),
      rows: []
    };
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
function h2hCanonicalKey(value) {
  return normalizeTeamKey(globalCanonicalTeamName(value) || value);
}

export function isH2HRowBeforeKickoff(row, fixtureKickoffUtc) {
  const cutoff = Date.parse(fixtureKickoffUtc || "");
  if (!Number.isFinite(cutoff)) return false;
  const raw = String(row?.date || row?.kickoffUtc || row?.kickoff || "").trim();
  if (!raw) return false;
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Day-only H2H rows cannot prove an earlier kickoff on the same day. Exclude
    // that day entirely so the current fixture can never leak into its own H2H.
    return raw < cutoffDay;
  }
  const ts = Date.parse(raw);
  return Number.isFinite(ts) && ts < cutoff;
}

function summarizeH2H(matches, perspectiveTeam) {
  const perspective = h2hCanonicalKey(perspectiveTeam);
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  for (const m of matches) {
    const homePerspective = h2hCanonicalKey(m?.homeTeam) === perspective;
    const mGf = homePerspective ? finiteScore(m?.scoreHome) : finiteScore(m?.scoreAway);
    const mGa = homePerspective ? finiteScore(m?.scoreAway) : finiteScore(m?.scoreHome);
    if (mGf === null || mGa === null) continue;
    gf += mGf; ga += mGa;
    if (mGf > mGa) wins += 1; else if (mGf < mGa) losses += 1; else draws += 1;
  }
  const sample = wins + draws + losses;
  return sample ? {
    wins, draws, losses,
    gfPerGame: +(gf / sample).toFixed(2),
    gaPerGame: +(ga / sample).toFixed(2),
    sample
  } : null;
}

export function buildH2HBlock(homeTeam, awayTeam, limit = 20, fixtureKickoffUtc = null) {
  if (_h2hFoundationOk === null) {
    _h2hFoundationOk = validateH2HFoundationSync().ok;
  }
  if (!_h2hFoundationOk) {
    return {
      status: "gated",
      reason: "h2h_foundation_stale",
      homeTeam,
      awayTeam,
      cutoffUtc: fixtureKickoffUtc || null,
      all: [], atHome: [], atAway: [],
      summary: { all: null, atHome: null, atAway: null }
    };
  }
  const h2h = getH2HForMatch(homeTeam, awayTeam);
  if (!h2h || !Array.isArray(h2h.all) || !h2h.all.length) {
    return {
      status: "empty",
      homeTeam,
      awayTeam,
      cutoffUtc: fixtureKickoffUtc || null,
      all: [], atHome: [], atAway: [],
      summary: { all: null, atHome: null, atAway: null }
    };
  }
  const beforeCutoff = list => (list || []).filter(row => isH2HRowBeforeKickoff(row, fixtureKickoffUtc));
  const allRaw = beforeCutoff(h2h.all);
  const atHomeRaw = beforeCutoff(h2h.atHome);
  const atAwayRaw = beforeCutoff(h2h.atAway);
  const trim = list => [...list]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
    .map(m => ({
      date: m.date || null,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      scoreHome: finiteScore(m.scoreHome),
      scoreAway: finiteScore(m.scoreAway),
      competition: m.competition || null,
      leagueSlug: m.leagueSlug || null
    }));
  return {
    status: allRaw.length ? "ready" : "empty",
    homeTeam,
    awayTeam,
    cutoffUtc: fixtureKickoffUtc || null,
    totalMeetings: allRaw.length,
    all: trim(allRaw),
    atHome: trim(atHomeRaw),
    atAway: trim(atAwayRaw),
    summary: {
      all: summarizeH2H(allRaw, homeTeam),
      atHome: summarizeH2H(atHomeRaw, homeTeam),
      atAway: summarizeH2H(atAwayRaw, homeTeam)
    }
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
  const cutoffUtc = canonicalUtc(match?.kickoffUtc || match?.kickoff || null);

  return {
    standings: buildStandingsBlock(slug, match),
    leagueForm5: buildLeagueFormTable(
      slug,
      readStandings(slug)?.accepted?.rows || [],
      cutoffUtc,
      season
    ),
    form: buildFormBlock(
      home,
      away,
      season,
      cutoffUtc
    ),
    opponentAdjustedForm:
      buildOpponentAdjustedFormBlock(match),
    h2h: buildH2HBlock(
      home,
      away,
      20,
      cutoffUtc
    )
  };
}
