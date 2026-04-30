import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";
import { isSameTeamName } from "./history-layer.js";
import { readPlayerUsageRecord } from "../storage/player-usage-db.js";

function safeNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(digits));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getStandingsTable(leagueSlug) {
  const file = resolveDataPath("standings", `${leagueSlug}.json`);
  const payload = readJsonSafe(file, null);

  const table =
    Array.isArray(payload?.table) ? payload.table :
    Array.isArray(payload?.standings) ? payload.standings :
    Array.isArray(payload?.rows) ? payload.rows :
    [];

  return {
    file,
    payload,
    table,
    confidence: safeNum(payload?.confidence, 0)
  };
}

function findStandingRow(table, teamName) {
  return (Array.isArray(table) ? table : []).find(row => {
    const names = [
      row?.team,
      row?.teamName,
      row?.name
    ].filter(Boolean);

    return names.some(name => isSameTeamName(name, teamName));
  }) || null;
}

function normalizeStandingRow(row) {
  if (!row) return null;

  const played = safeNum(row.played ?? row.games ?? row.matchesPlayed, null);
  const points = safeNum(row.points, null);
  const goalsFor = safeNum(row.goalsFor ?? row.gf, null);
  const goalsAgainst = safeNum(row.goalsAgainst ?? row.ga, null);

  return {
    team: row.team || row.teamName || row.name || null,
    position: safeNum(row.position ?? row.rank, null),
    played,
    wins: safeNum(row.wins, null),
    draws: safeNum(row.draws, null),
    losses: safeNum(row.losses, null),
    points,
    goalsFor,
    goalsAgainst,
    goalDiff: safeNum(row.goalDiff ?? row.goalDifference, null),
    pointsPerMatch: played ? round(points / played) : null,
    goalsForPerMatch: played ? round(goalsFor / played) : null,
    goalsAgainstPerMatch: played ? round(goalsAgainst / played) : null,
    confidence: safeNum(row.confidence, null)
  };
}

function buildStandingsSnapshot(match, competitionContext) {
  const leagueSlug = match?.leagueSlug || null;
  const standings = getStandingsTable(leagueSlug);

  const homeRow = normalizeStandingRow(findStandingRow(standings.table, match?.homeTeam));
  const awayRow = normalizeStandingRow(findStandingRow(standings.table, match?.awayTeam));

  return {
    status: homeRow || awayRow ? "ready" : "empty",
    leagueSlug,
    home: homeRow,
    away: awayRow,
    positions: competitionContext?.data?.positions || null,
    stakes: competitionContext?.data?.stakes || null,
    pressure: competitionContext?.data?.pressure || [],
    importance: competitionContext?.data?.importance || "unknown",
    confidence: standings.confidence,
    source: "local-standings",
    diagnostics: {
      standingsFile: standings.file,
      tableRows: standings.table.length,
      foundHome: !!homeRow,
      foundAway: !!awayRow
    }
  };
}

function summarizeFormSide(side) {
  const wins = safeNum(side?.record?.wins, 0);
  const draws = safeNum(side?.record?.draws, 0);
  const losses = safeNum(side?.record?.losses, 0);
  const points = wins * 3 + draws;
  const sampleSize = safeNum(side?.sampleSize, 0);

  return {
    sampleSize,
    last5: Array.isArray(side?.last5) ? side.last5 : [],
    record: {
      wins,
      draws,
      losses,
      points,
      pointsPerMatch: sampleSize ? round(points / sampleSize) : null
    },
    goals: {
      scored: safeNum(side?.goals?.scored, 0),
      conceded: safeNum(side?.goals?.conceded, 0),
      avgScored: side?.goals?.avgScored ?? null,
      avgConceded: side?.goals?.avgConceded ?? null
    },
    trends: side?.trends || {},
    formScore: side?.formScore ?? null,
    momentum: side?.momentum || "unknown",
    confidence: side?.confidence ?? 0
  };
}

function buildFormSnapshot(formGuide) {
  return {
    status:
      (formGuide?.homeTeam?.sampleSize || formGuide?.awayTeam?.sampleSize)
        ? "ready"
        : "empty",
    home: summarizeFormSide(formGuide?.homeTeam || {}),
    away: summarizeFormSide(formGuide?.awayTeam || {}),
    comparison: formGuide?.comparison || null,
    meta: formGuide?.meta || null
  };
}

function buildH2hSnapshot(headToHeadGuide) {
  return {
    status: headToHeadGuide?.sampleSize ? "ready" : "empty",
    sampleSize: headToHeadGuide?.sampleSize || 0,
    last5: Array.isArray(headToHeadGuide?.matches)
      ? headToHeadGuide.matches.slice(0, 5)
      : [],
    stats: headToHeadGuide?.stats || null,
    trend: headToHeadGuide?.trend || null,
    confidence: headToHeadGuide?.confidence ?? 0,
    summary: Array.isArray(headToHeadGuide?.summary)
      ? headToHeadGuide.summary
      : [],
    meta: headToHeadGuide?.meta || null
  };
}

function sortUsageMatches(matches = []) {
  return [...(Array.isArray(matches) ? matches : [])]
    .sort((a, b) => Date.parse(b?.date || 0) - Date.parse(a?.date || 0));
}

function buildUsageSide(teamName) {
  const record = readPlayerUsageRecord(teamName);

  if (!record || !Array.isArray(record.matches) || !record.matches.length) {
    return {
      status: "empty",
      team: teamName || null,
      sampleSize: 0,
      expectedStarters: [],
      coreStarters: [],
      starterFrequency: {},
      confidence: 0,
      source: "local-player-usage",
      reason: "missing_player_usage_record"
    };
  }

  const last5 = sortUsageMatches(record.matches).slice(0, 5);
  const freq = new Map();

  for (const match of last5) {
    for (const player of Array.isArray(match.players) ? match.players : []) {
      if (player?.starter !== true) continue;
      const name = String(player?.name || "").trim();
      if (!name) continue;
      freq.set(name, (freq.get(name) || 0) + 1);
    }
  }

  const starterFrequency = Object.fromEntries(
    [...freq.entries()].sort((a, b) => b[1] - a[1])
  );

  const expectedStarters = Object.entries(starterFrequency)
    .filter(([, count]) => count >= 2)
    .map(([name]) => name);

  const coreStarters = Object.entries(starterFrequency)
    .filter(([, count]) => count >= 4)
    .map(([name]) => name);

  const sampleSize = last5.length;

  return {
    status: sampleSize >= 3 ? "ready" : "partial",
    team: record.team || teamName || null,
    sampleSize,
    expectedStarters,
    coreStarters,
    starterFrequency,
    last5: last5.map(match => ({
      matchId: match.matchId || null,
      date: match.date || null,
      opponent: match.opponent || null,
      side: match.side || null,
      starters: (match.players || [])
        .filter(p => p?.starter === true)
        .map(p => p.name)
        .filter(Boolean)
    })),
    confidence: sampleSize >= 5 ? 0.72 : sampleSize >= 3 ? 0.55 : 0.32,
    source: "local-player-usage",
    reason: null
  };
}

function buildUsageSnapshot(match, teamNewsContext) {
  const home = buildUsageSide(match?.homeTeam);
  const away = buildUsageSide(match?.awayTeam);

  const homeAbsences = teamNewsContext?.data?.home?.absences || [];
  const awayAbsences = teamNewsContext?.data?.away?.absences || [];

  return {
    status:
      home.status !== "empty" || away.status !== "empty"
        ? "ready"
        : "empty",
    home,
    away,
    inferredAbsenceRisk: {
      home: {
        status: home.status === "empty" ? "unavailable" : "watchlist",
        confirmedAbsenceCount: homeAbsences.length,
        coreStarterCount: home.coreStarters.length,
        note: home.status === "empty"
          ? "No player-usage record available."
          : "Usage baseline available; compare against confirmed lineup when current lineup is ingested."
      },
      away: {
        status: away.status === "empty" ? "unavailable" : "watchlist",
        confirmedAbsenceCount: awayAbsences.length,
        coreStarterCount: away.coreStarters.length,
        note: away.status === "empty"
          ? "No player-usage record available."
          : "Usage baseline available; compare against confirmed lineup when current lineup is ingested."
      }
    }
  };
}

function buildProfileSummary({ standings, form, h2h, usage }) {
  const notes = [];

  if (standings?.home?.position && standings?.away?.position) {
    notes.push(`Table: ${standings.home.team} #${standings.home.position} vs ${standings.away.team} #${standings.away.position}.`);
  }

  if (form?.home?.record && form?.away?.record) {
    notes.push(`Last5 points: home ${form.home.record.points}, away ${form.away.record.points}.`);
  }

  if (h2h?.sampleSize) {
    notes.push(`H2H sample: ${h2h.sampleSize} recent matches.`);
  }

  if (usage?.home?.status !== "empty" || usage?.away?.status !== "empty") {
    notes.push("Player-usage baseline is available for lineup continuity checks.");
  }

  return notes;
}

export function buildMatchProfileContext(match, contexts = {}) {
  const {
    historyContext,
    formGuide,
    headToHeadGuide,
    competitionContext,
    teamNewsContext,
    lineupContext,
    travelContext,
    valueSummary
  } = contexts;

  const standings = buildStandingsSnapshot(match, competitionContext);
  const form = buildFormSnapshot(formGuide);
  const h2h = buildH2hSnapshot(headToHeadGuide);
  const usage = buildUsageSnapshot(match, teamNewsContext);

  const readiness = {
    history: !!historyContext,
    form: form.status === "ready",
    h2h: h2h.status === "ready",
    standings: standings.status === "ready",
    teamNews: !!teamNewsContext?.data,
    lineup: !!lineupContext?.data,
    travel: !!travelContext?.data,
    playerUsage: usage.status === "ready",
    value: !!valueSummary
  };

  const readyCount = Object.values(readiness).filter(Boolean).length;
  const confidence = round(Math.min(0.9, 0.25 + readyCount * 0.07), 2);

  return {
    key: "match_profile",
    status: readyCount >= 3 ? "ready" : readyCount > 0 ? "partial" : "empty",
    data: {
      matchId: match?.matchId || match?.id || null,
      leagueSlug: match?.leagueSlug || null,
      homeTeam: match?.homeTeam || null,
      awayTeam: match?.awayTeam || null,
      kickoffUtc: match?.kickoffUtc || null,

      standings,
      seasonFormLast5: form,
      h2hLast5: h2h,
      playerUsage: usage,

      teamNews: {
        status: teamNewsContext?.status || "empty",
        reliability: teamNewsContext?.reliability || "empty",
        confidence: teamNewsContext?.confidence ?? 0
      },

      lineup: {
        status: lineupContext?.status || "empty",
        reliability: lineupContext?.reliability || "empty",
        confidence: lineupContext?.confidence ?? 0
      },

      travel: {
        status: travelContext?.status || "empty",
        confidence: travelContext?.confidence ?? 0
      },

      value: valueSummary || null,

      summary: buildProfileSummary({
        standings,
        form,
        h2h,
        usage
      })
    },
    confidence,
    readiness,
    source: "local-match-profile-context"
  };
}