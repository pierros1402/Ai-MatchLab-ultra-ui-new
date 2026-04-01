//============================================================
// STANDINGS BUILDER – CLEAN v6.0 (Canonical Only)
//============================================================

import { computeStandings } from "../../_shared/ranking-engine.js";

function isFinal(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("FT") ||
    s.includes("COMPLETE") ||
    s.includes("AET") ||
    s.includes("PEN")
  );
}

export async function buildStandingsFromR2(env, league, season, opts = {}) {

  const prefix = `league/${league}/${season}/matches/`;

  const table = {};
  const h2hMatrix = {};

  let cursor = undefined;

  // ============================================================
  // READ CANONICAL MATCHES
  // ============================================================

  while (true) {

    const options = cursor ? { prefix, cursor } : { prefix };
    const list = await env.AI_STATE.list(options);

    if (!list || !Array.isArray(list.objects)) break;

    for (const obj of list.objects) {

      const raw = await env.AI_STATE.get(obj.key);
      if (!raw) continue;

      let match;

      try {
        const text = await raw.text();
        match = JSON.parse(text);
      } catch {
        continue;
      }

      if (!match || typeof match !== "object") continue;

      const status = match.status;

      if (!isFinal(status)) continue;

      const home = match.home;
      const away = match.away;

      const gf = Number(match.scoreHome);
      const ga = Number(match.scoreAway);

      if (!home || !away) continue;
      if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;

      update(table, home, gf, ga);
      update(table, away, ga, gf);

      updateH2H(h2hMatrix, home, away, gf, ga);
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  // ============================================================
  // PREPARE RANKING INPUT
  // ============================================================

  const teams = {};

  for (const t of Object.values(table)) {
    teams[t.team] = {
      points: t.points,
      goalsFor: t.gf,
      goalsAgainst: t.ga,
      goalDifference: t.gf - t.ga,
      wins: t.wins,
      draws: t.draws,
      losses: t.losses,
      played: t.played
    };
  }

  const leagueRules = opts.leagueRules || {
    tieBreakOrder: ["points", "goalDifference", "goalsFor"],
    phases: { regular: { type: "table" } }
  };

  const ranking = computeStandings({
    teams,
    h2hMatrix,
    leagueRules,
    phase: "regular",
    previousStandings: opts.previousStandings || null
  });

  return {
    standings: ranking.standings.map(row => ({
      team: row.team,
      played: table[row.team]?.played ?? 0,
      wins: table[row.team]?.wins ?? 0,
      draws: table[row.team]?.draws ?? 0,
      losses: table[row.team]?.losses ?? 0,
      gf: table[row.team]?.gf ?? 0,
      ga: table[row.team]?.ga ?? 0,
      points: row.points,
      position: row.position,
      positionDelta: row.positionDelta ?? 0
    })),
    rankingHash: ranking.rankingHash
  };
}

// ============================================================
// TEAM UPDATE
// ============================================================

function update(table, team, gf, ga) {

  if (!table[team]) {
    table[team] = {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      points: 0
    };
  }

  const t = table[team];

  t.played++;
  t.gf += gf;
  t.ga += ga;

  if (gf > ga) {
    t.wins++;
    t.points += 3;
  } else if (gf === ga) {
    t.draws++;
    t.points += 1;
  } else {
    t.losses++;
  }
}

// ============================================================
// H2H MATRIX
// ============================================================

function updateH2H(matrix, home, away, gf, ga) {

  const key = [home, away].sort().join("|");

  if (!matrix[key]) {
    matrix[key] = {
      pointsA: 0,
      pointsB: 0,
      goalsA: 0,
      goalsB: 0
    };
  }

  const record = matrix[key];

  const homeIsA = home < away;

  const pointsHome = gf > ga ? 3 : gf === ga ? 1 : 0;
  const pointsAway = ga > gf ? 3 : ga === gf ? 1 : 0;

  if (homeIsA) {
    record.pointsA += pointsHome;
    record.pointsB += pointsAway;
    record.goalsA += gf;
    record.goalsB += ga;
  } else {
    record.pointsA += pointsAway;
    record.pointsB += pointsHome;
    record.goalsA += ga;
    record.goalsB += gf;
  }
}