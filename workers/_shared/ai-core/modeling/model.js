
// ============================================================
// AIMATCHLAB – AI MODELING ENGINE (TIER-AWARE INTEGRATION)
// ============================================================

import { getLeagueTier } from "../ai-tier-config.js";

export function buildModel(structural, payload){

  const tier = getLeagueTier(payload?.leagueSlug);

  let standingsRaw = structural.standings;

  let standings = [];

  if (Array.isArray(standingsRaw)) {
    standings = standingsRaw;
  } else if (standingsRaw && typeof standingsRaw === "object") {
    standings =
      standingsRaw.table ||
      standingsRaw.standings ||
      standingsRaw.items ||
      standingsRaw.data ||
      [];
  }

  const leagueProfile = structural.leagueProfile || {};

  const home = standings.find(t=>t.team===payload.home);
  const away = standings.find(t=>t.team===payload.away);

  let positionGap = 0;
  let gdDelta = 0;
  let pressureFactor = 1;

  if(home && away){
    positionGap = Math.abs(home.position - away.position);
    gdDelta = (home.goalDiff||0) - (away.goalDiff||0);
    pressureFactor = home.position <= 4 || away.position <= 4 ? 1.2 : 1;
  }

  const tableData = Array.isArray(structural.table)
    ? structural.table
    : [];

  const homeTable = tableData.find(t => t.team === payload.home);
  const awayTable = tableData.find(t => t.team === payload.away);

  let ppgDiff = 0;
  let scoringBias = 0;
  let defensiveBias = 0;

  if (homeTable && awayTable) {
    ppgDiff =
      (homeTable.points_per_game || 0) -
      (awayTable.points_per_game || 0);

    scoringBias =
      (homeTable.goals_for || 0) -
      (awayTable.goals_for || 0);

    defensiveBias =
      (awayTable.goals_against || 0) -
      (homeTable.goals_against || 0);
  }

  const tempoBaseline = leagueProfile.avgGoals > 3 ? "high" : "balanced";
  const volatilityIndex = leagueProfile.volatilityIndex || 0.5;

  const dna = {
    tempo: tempoBaseline,
    volatility:
      volatilityIndex > 0.65 ? "high" :
      volatilityIndex < 0.35 ? "low" : "medium",
    pressure:
      positionGap <= 2 ? "high" :
      positionGap >= 8 ? "low" : "medium"
  };

  let upsetIndex =
    positionGap >= 6 ? Math.round(15 * pressureFactor)
    : Math.round(30 * pressureFactor);

  if (ppgDiff > 0.6) upsetIndex -= 8;
  if (ppgDiff < -0.6) upsetIndex += 8;

  upsetIndex = Math.max(5, Math.min(60, upsetIndex));

  let drawIndex =
    positionGap <= 2 ? 45
    : positionGap >= 8 ? 20 : 30;

  if (Math.abs(ppgDiff) < 0.3) drawIndex += 8;
  if (Math.abs(ppgDiff) > 0.8) drawIndex -= 10;

  drawIndex = Math.max(10, Math.min(70, drawIndex));

  let goalRisk =
    Math.abs(gdDelta) >= 15 ? "asymmetric"
    : volatilityIndex > 0.7 ? "open"
    : "controlled";

  if (scoringBias > 15) goalRisk = "high-scoring-tilt";
  if (defensiveBias > 15) goalRisk = "defensive-fragility";

  // -----------------------------
  // TIER MODIFIERS (SAFE LAYER)
  // -----------------------------

  const TIER_RULES = {
    1: { upsetMul: 1.0, drawMul: 1.0 },
    2: { upsetMul: 1.05, drawMul: 1.05 },
    3: { upsetMul: 1.1, drawMul: 1.1 },
    4: { upsetMul: 1.15, drawMul: 1.15 },
    5: { upsetMul: 1.2, drawMul: 1.2 }
  };

  const tierRule = TIER_RULES[tier] || TIER_RULES[3];

  upsetIndex = Math.round(upsetIndex * tierRule.upsetMul);
  drawIndex = Math.round(drawIndex * tierRule.drawMul);

  upsetIndex = Math.max(5, Math.min(70, upsetIndex));
  drawIndex = Math.max(10, Math.min(75, drawIndex));

  const risk = {
    upsetIndex,
    drawIndex,
    goalRisk
  };

  const minute = payload.minute || 0;
  const isLive = payload.status === "LIVE";

  let momentum = { state: "neutral", escalation: 1 };

  if(isLive){
    if(minute >= 75){
      momentum = { state: "late-pressure", escalation: 1.3 };
    } else if(minute >= 45){
      momentum = { state: "mid-shift", escalation: 1.15 };
    }
  }

  const insights = [
    `League tier: ${tier}`,
    `Tempo baseline: ${dna.tempo}`,
    `Volatility regime: ${dna.volatility}`,
    `Pressure context: ${dna.pressure}`,
    `Goal risk profile: ${goalRisk}`,
    ...(ppgDiff !== 0
      ? [`Form delta (PPG): ${ppgDiff.toFixed(2)}`]
      : [])
  ];

  const standardQuestions = [
    {
      id: "tempo-control",
      title: "Tempo Control",
      q: "Can tempo baseline override volatility dynamics?",
      a: {
        bullets: [
          `League tempo baseline: ${dna.tempo}`,
          `Volatility index impact: ${dna.volatility}`,
          `Momentum state: ${momentum.state}`
        ]
      }
    },
    {
      id: "positional-pressure",
      title: "Positional Pressure",
      q: "Does table position gap create structural imbalance?",
      a: {
        bullets: [
          `Position gap: ${positionGap}`,
          `Pressure level: ${dna.pressure}`,
          `Upset index (tier-adjusted): ${upsetIndex}`
        ]
      }
    }
  ];

  return {
    tier,
    dna,
    winPaths:{
      home:["Structured build-up advantage","Set-piece leverage scenario"],
      draw:["Tactical balance scenario","Midfield control deadlock"],
      away:["Counter transition opportunity","High press disruption"]
    },
    risk,
    momentum,
    insights,
    standardQuestions
  };
}
