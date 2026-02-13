
export function buildModel(structural, payload){

  const standings = structural.standings || [];

  const home = standings.find(t=>t.team===payload.home);
  const away = standings.find(t=>t.team===payload.away);

  let positionGap = 0;
  let gdDelta = 0;

  if(home && away){
    positionGap = Math.abs(home.position - away.position);
    gdDelta = (home.goalDiff||0) - (away.goalDiff||0);
  }

  const volatility =
    positionGap <= 2 ? "high" :
    positionGap >= 8 ? "low" : "medium";

  const upsetIndex =
    positionGap >= 6 ? 15 : 30;

  return {
    dna:{
      tempo: structural.leagueProfile?.avgGoals > 3 ? "high":"balanced",
      volatility
    },
    winPaths:{
      home:["Structured build-up advantage"],
      draw:["Tactical balance scenario"],
      away:["Counter transition opportunity"]
    },
    risk:{
      upsetIndex,
      drawIndex: positionGap <= 2 ? 40 : 25
    },
    momentum:
      payload.status==="LIVE"
        ? {
            phase:
              payload.minute<30?"early":
              payload.minute<60?"mid":"late"
          }
        : null
  };
}
