// ============================================================
// STANDINGS CACHE ENGINE – v6 (Incremental)
// ============================================================

import { computeStandings } from "../../_shared/ranking-engine.js";

export async function updateStandingsCache(env, league, season, match) {

  const stateKey =
    `league/${league}/${season}/standings-state.json`;

  const tableKey =
    `league/${league}/${season}/table.json`;

  // ------------------------------------------------------------
  // LOAD CACHE STATE
  // ------------------------------------------------------------
  let state = {
    teams: {},
    processed: {}
  };

  try {
    const obj = await env.AI_STATE.get(stateKey);
    if (obj) {
      state = JSON.parse(await obj.text());
    }
  } catch (_) {}


  // ------------------------------------------------------------
  // EXTRACT MATCH DATA
  // ------------------------------------------------------------
  let home, away, gf, ga, statusName;

  if (match.competitions?.[0]?.competitors) {

    const comp = match.competitions[0];

    statusName =
      comp.status?.type?.name ||
      match.status?.type?.name ||
      match.status;

    const isFinal =
      typeof statusName === "string" &&
      (
        statusName.includes("FINAL") ||
        statusName.includes("FULL_TIME") ||
        statusName.includes("COMPLETE") ||
        statusName.includes("AET") ||
        statusName.includes("PEN")
      );

    if (!isFinal) return { skipped: true };

    const homeObj =
      comp.competitors.find(c => c.homeAway === "home");

    const awayObj =
      comp.competitors.find(c => c.homeAway === "away");

    if (!homeObj || !awayObj) return { skipped: true };

    home = homeObj.team?.displayName;
    away = awayObj.team?.displayName;

    gf = Number(homeObj.score);
    ga = Number(awayObj.score);

  } else {

    statusName =
      match.status?.type?.name ||
      match.status;

    const isFinal =
      typeof statusName === "string" &&
      (
        statusName.includes("FINAL") ||
        statusName.includes("FULL_TIME") ||
        statusName.includes("COMPLETE") ||
        statusName.includes("AET") ||
        statusName.includes("PEN")
      );

    if (!isFinal) return { skipped: true };

    home = match.home;
    away = match.away;

    gf = Number(match.scoreHome);
    ga = Number(match.scoreAway);
  }

  if (!home || !away) return { skipped: true };
  if (!Number.isFinite(gf) || !Number.isFinite(ga)) return { skipped: true };
  if (gf < 0 || ga < 0) {
    return { skipped: true };
  } 

// ------------------------------------------------------------
// SKIP IF MATCH ALREADY PROCESSED
// ------------------------------------------------------------
const matchId = match.id;
const scoreSig = `${gf}-${ga}`;

if (state.processed[matchId] === scoreSig) {
  return { skipped: true };
}
 
  // ------------------------------------------------------------
  // TEAM INIT
  // ------------------------------------------------------------
  if (!state.teams[home]) {
    state.teams[home] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      points: 0
    };
  }

  if (!state.teams[away]) {
    state.teams[away] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      points: 0
    };
  }

  const h = state.teams[home];
  const a = state.teams[away];

  h.played++;
  a.played++;

  h.gf += gf;
  h.ga += ga;

  a.gf += ga;
  a.ga += gf;

  if (gf > ga) {
    h.wins++;
    h.points += 3;
    a.losses++;
  } else if (gf === ga) {
    h.draws++;
    a.draws++;
    h.points += 1;
    a.points += 1;
  } else {
    a.wins++;
    a.points += 3;
    h.losses++;
  }

  state.processed[matchId] = scoreSig;

  // ------------------------------------------------------------
  // BUILD RANKING
  // ------------------------------------------------------------
  const teams = {};

  for (const t in state.teams) {

    const s = state.teams[t];

    teams[t] = {
      points: s.points,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      goalDifference: s.gf - s.ga,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      played: s.played
    };
  }

  const ranking = computeStandings({
    teams,
    h2hMatrix: {},
    leagueRules: {
      tieBreakOrder: ["points", "goalDifference", "goalsFor"],
      phases: { regular: { type: "table" } }
    },
    phase: "regular"
  });

  const standings = ranking.standings.map(row => ({
    team: row.team,
    played: state.teams[row.team].played,
    wins: state.teams[row.team].wins,
    draws: state.teams[row.team].draws,
    losses: state.teams[row.team].losses,
    gf: state.teams[row.team].gf,
    ga: state.teams[row.team].ga,
    points: row.points,
    position: row.position,
    positionDelta: row.positionDelta ?? 0
  }));

  // ------------------------------------------------------------
  // WRITE CACHE
  // ------------------------------------------------------------
  await env.AI_STATE.put(
    stateKey,
    JSON.stringify(state),
    { httpMetadata: { contentType: "application/json" } }
  );

  await env.AI_STATE.put(
    tableKey,
    JSON.stringify(standings),
    { httpMetadata: { contentType: "application/json" } }
  );

  return {
    ok: true,
    rankingHash: ranking.rankingHash
  };
}