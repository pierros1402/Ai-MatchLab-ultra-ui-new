// engine-v1/core/form-guide.js

import { isSameTeamName } from "./history-layer.js";

export function buildFormGuide(match, historyInput) {
  const homeTeam = match?.homeTeam || match?.basic?.homeTeam;
  const awayTeam = match?.awayTeam || match?.basic?.awayTeam;

  const homeMatches = resolveTeamMatches(historyInput, "home", homeTeam, 5);
  const awayMatches = resolveTeamMatches(historyInput, "away", awayTeam, 5);

  const homeStats = buildTeamForm(homeMatches, homeTeam, historyInput?.meta || null);
  const awayStats = buildTeamForm(awayMatches, awayTeam, historyInput?.meta || null);

  return {
    homeTeam: homeStats,
    awayTeam: awayStats,
    comparison: buildComparison(homeStats, awayStats),
    meta: historyInput?.meta || null
  };
}

function resolveTeamMatches(historyInput, side, team, limit = 5) {
  if (Array.isArray(historyInput)) {
    return getLastMatchesFromRows(historyInput, team, limit);
  }

  if (historyInput && typeof historyInput === "object") {
    if (side === "home" && Array.isArray(historyInput.homeMatches)) {
      return historyInput.homeMatches.slice(0, limit);
    }
    if (side === "away" && Array.isArray(historyInput.awayMatches)) {
      return historyInput.awayMatches.slice(0, limit);
    }
  }

  return [];
}

function getLastMatchesFromRows(rows, team, limit = 5) {
  return rows
    .filter(m => {
      if (!isFinalLike(m?.status)) return false;
      return isSameTeamName(m?.homeTeam, team) || isSameTeamName(m?.awayTeam, team);
    })
    .sort((a, b) => new Date(b?.kickoff || 0) - new Date(a?.kickoff || 0))
    .slice(0, limit);
}

function isFinalLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "FT" || s.includes("FINAL") || s.includes("FULL_TIME") || s.includes("COMPLETE") || s.includes("AET") || s.includes("PEN");
}

function buildTeamForm(matches, team) {
  let wins = 0, draws = 0, losses = 0;
  let scored = 0, conceded = 0;

  let cleanSheets = 0, failedToScore = 0;
  let over25 = 0, under25 = 0, bttsYes = 0, bttsNo = 0;

  let weightedScore = 0;
  let weightSum = 0;

  const last5 = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];

    const isHome = isSameTeamName(m.homeTeam, team);

    const gf = Number(isHome ? m.scoreHome : m.scoreAway);
    const ga = Number(isHome ? m.scoreAway : m.scoreHome);

    if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;

    // -------------------------
    // RECENCY WEIGHT (NEW)
    // -------------------------
    const weight = 1 - (i * 0.15); // 1.0, 0.85, 0.7, 0.55, 0.4
    const clampedWeight = Math.max(weight, 0.3);

    weightSum += clampedWeight;

    let resultScore = 0;
    if (gf > ga) resultScore = 1;
    else if (gf === ga) resultScore = 0.5;
    else resultScore = 0;

    weightedScore += resultScore * clampedWeight;

    // -------------------------
    // BASIC STATS
    // -------------------------
    scored += gf;
    conceded += ga;

    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;

    if (ga === 0) cleanSheets++;
    if (gf === 0) failedToScore++;

    if (gf + ga > 2.5) over25++;
    else under25++;

    if (gf > 0 && ga > 0) bttsYes++;
    else bttsNo++;

    last5.push({
      opponent: isHome ? m.awayTeam : m.homeTeam,
      result: gf > ga ? "W" : gf === ga ? "D" : "L",
      score: `${gf}-${ga}`,
      date: m.kickoff || null,
      league: m.leagueName || m.leagueSlug || null,
      season: m.season || null,
      source: m.source || null
    });
  }

  const sampleSize = last5.length;

  const formScore = weightSum > 0 ? round(weightedScore / weightSum) : 0;

  return {
    sampleSize,
    last5,

    record: { wins, draws, losses },

    goals: {
      scored,
      conceded,
      avgScored: sampleSize ? round(scored / sampleSize) : null,
      avgConceded: sampleSize ? round(conceded / sampleSize) : null
    },

    trends: {
      cleanSheets,
      failedToScore,
      over25,
      under25,
      bttsYes,
      bttsNo
    },

    // -------------------------
    // NEW SIGNALS
    // -------------------------
    formScore, // 0 → 1
    momentum:
      formScore >= 0.7 ? "strong" :
      formScore >= 0.55 ? "positive" :
      formScore >= 0.45 ? "neutral" :
      formScore >= 0.3 ? "negative" :
      "poor",

    summary: buildSummary({
      wins,
      losses,
      cleanSheets,
      failedToScore,
      over25,
      bttsYes
    }),

    confidence: buildConfidence(sampleSize)
  };
}

function buildSummary(stats) {
  const out = [];

  if (stats.wins >= 3) out.push("Strong recent form");
  if (stats.losses >= 3) out.push("Poor recent form");

  if (stats.cleanSheets >= 3) out.push("Defensively solid");
  if (stats.failedToScore >= 3) out.push("Struggling to score");

  if (stats.over25 >= 3) out.push("High goal involvement");
  if (stats.bttsYes >= 3) out.push("Both teams scoring frequently");

  return out;
}

function buildComparison(home, away) {
  let edge = null;

  if (home.record.wins > away.record.wins) edge = "home";
  else if (away.record.wins > home.record.wins) edge = "away";

  return {
    edge,
    notes: []
  };
}

function buildConfidence(sampleSize) {
  if (sampleSize >= 5) return 0.85;
  if (sampleSize >= 3) return 0.65;
  if (sampleSize >= 1) return 0.4;
  return 0;
}

function round(n) {
  return Number(n.toFixed(2));
}