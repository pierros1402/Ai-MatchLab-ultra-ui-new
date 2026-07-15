import { isSameTeamName } from "./history-layer.js";

function round(n) {
  return Number(Number(n || 0).toFixed(2));
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isHomePerspective(row, homeTeam, awayTeam) {
  const rowHome = String(row?.homeTeam || "");
  const rowAway = String(row?.awayTeam || "");

  return isSameTeamName(rowHome, homeTeam) && isSameTeamName(rowAway, awayTeam);
}

export function buildHeadToHeadGuide(match, historyContext) {
  const rows = Array.isArray(historyContext?.headToHeadMatches)
    ? historyContext.headToHeadMatches
    : [];

  const homeTeam = match?.homeTeam || null;
  const awayTeam = match?.awayTeam || null;

  if (!rows.length) {
    return {
      sampleSize: 0,
      matches: [],
      stats: {
        homeWins: 0,
        draws: 0,
        awayWins: 0,
        goalsForHomePerspective: 0,
        goalsForAwayPerspective: 0,
        avgGoalsTotal: null,
        over25: 0,
        under25: 0,
        bttsYes: 0,
        bttsNo: 0
      },
      trend: {
        edge: null,
        goalPattern: "unknown"
      },
      confidence: 0,
      summary: [],
      meta: {
        mergedSample: Number(historyContext?.meta?.h2hSampleMerged || 0)
      }
    };
  }

  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let goalsForHomePerspective = 0;
  let goalsForAwayPerspective = 0;
  let over25 = 0;
  let under25 = 0;
  let bttsYes = 0;
  let bttsNo = 0;

  const matches = rows.map(row => {
    const scoreHome = safeNum(row?.scoreHome, 0);
    const scoreAway = safeNum(row?.scoreAway, 0);
    const totalGoals = scoreHome + scoreAway;

    const sameDirection = isHomePerspective(row, homeTeam, awayTeam);

    const hf = sameDirection ? scoreHome : scoreAway;
    const af = sameDirection ? scoreAway : scoreHome;

    goalsForHomePerspective += hf;
    goalsForAwayPerspective += af;

    if (hf > af) homeWins += 1;
    else if (hf === af) draws += 1;
    else awayWins += 1;

    if (totalGoals > 2.5) over25 += 1;
    else under25 += 1;

    if (scoreHome > 0 && scoreAway > 0) bttsYes += 1;
    else bttsNo += 1;

    return {
      date: row?.kickoff || null,
      league: row?.leagueName || row?.leagueSlug || null,
      season: row?.season || null,
      homeTeam: row?.homeTeam || null,
      awayTeam: row?.awayTeam || null,
      score: `${scoreHome}-${scoreAway}`,
      resultFromCurrentPerspective:
        hf > af ? "HOME_WIN" : hf === af ? "DRAW" : "AWAY_WIN",
      source: row?.source || null
    };
  });

  const sampleSize = matches.length;
  const avgGoalsTotal = sampleSize
    ? round((goalsForHomePerspective + goalsForAwayPerspective) / sampleSize)
    : null;

  let edge = null;
  if (homeWins > awayWins) edge = "home";
  else if (awayWins > homeWins) edge = "away";

  let goalPattern = "balanced";
  if (over25 >= Math.max(3, Math.ceil(sampleSize * 0.6))) {
    goalPattern = "overlean";
  } else if (under25 >= Math.max(3, Math.ceil(sampleSize * 0.6))) {
    goalPattern = "underlean";
  }

  const summary = [];

  if (edge === "home") {
    summary.push(`${homeTeam} έχει καλύτερο πρόσφατο H2H δείγμα.`);
  } else if (edge === "away") {
    summary.push(`${awayTeam} έχει καλύτερο πρόσφατο H2H δείγμα.`);
  } else {
    summary.push("Το πρόσφατο H2H δείγμα είναι ισορροπημένο.");
  }

  if (goalPattern === "overlean") {
    summary.push("Το πρόσφατο H2H δείχνει τάση για υψηλότερο σύνολο γκολ.");
  } else if (goalPattern === "underlean") {
    summary.push("Το πρόσφατο H2H δείχνει τάση για πιο κλειστά σκορ.");
  }

  if (bttsYes >= Math.max(3, Math.ceil(sampleSize * 0.6))) {
    summary.push("Υπάρχει επαναλαμβανόμενο BTTS μοτίβο στο H2H.");
  }

  let confidence = 0;
  if (sampleSize >= 5) confidence = 0.82;
  else if (sampleSize >= 3) confidence = 0.64;
  else if (sampleSize >= 1) confidence = 0.4;

  return {
    sampleSize,
    matches,
    stats: {
      homeWins,
      draws,
      awayWins,
      goalsForHomePerspective,
      goalsForAwayPerspective,
      avgGoalsTotal,
      over25,
      under25,
      bttsYes,
      bttsNo
    },
    trend: {
      edge,
      goalPattern
    },
    confidence,
    summary,
    meta: {
      mergedSample: Number(historyContext?.meta?.h2hSampleMerged || sampleSize)
    }
  };
}