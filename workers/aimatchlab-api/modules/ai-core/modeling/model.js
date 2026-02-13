
export function buildModel(structural, payload){

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

  // ===== DNA =====
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

  // ===== RISK =====
  const upsetIndex =
    positionGap >= 6 ? Math.round(15 * pressureFactor) :
    Math.round(30 * pressureFactor);

  const drawIndex =
    positionGap <= 2 ? 45 :
    positionGap >= 8 ? 20 : 30;

  const goalRisk =
    Math.abs(gdDelta) >= 15 ? "asymmetric" :
    volatilityIndex > 0.7 ? "open" : "controlled";

  const risk = {
    upsetIndex,
    drawIndex,
    goalRisk
  };

  // ===== MOMENTUM =====
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

  // ===== INSIGHTS =====
  const insights = [
    `Tempo baseline: ${dna.tempo}`,
    `Volatility regime: ${dna.volatility}`,
    `Pressure context: ${dna.pressure}`,
    `Goal risk profile: ${goalRisk}`
  ];

  // ===== STANDARD QUESTIONS (STRUCTURED) =====
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
          `Upset index: ${upsetIndex}`
        ]
      }
    },
    {
      id: "goal-dynamics",
      title: "Goal Dynamics",
      q: "Is goal differential skewing tactical balance?",
      a: {
        bullets: [
          `Goal diff delta: ${gdDelta}`,
          `Goal risk regime: ${goalRisk}`
        ]
      }
    },
    {
      id: "draw-probability",
      title: "Draw Probability",
      q: "Is match equilibrium statistically supported?",
      a: {
        bullets: [
          `Draw index: ${drawIndex}`,
          `Pressure alignment: ${dna.pressure}`
        ]
      }
    },
    {
      id: "late-volatility",
      title: "Late Volatility",
      q: "Will late-stage escalation alter risk balance?",
      a: {
        bullets: [
          `Minute: ${minute}`,
          `Momentum escalation: ${momentum.escalation}`
        ]
      }
    }
  ];

  return {
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
