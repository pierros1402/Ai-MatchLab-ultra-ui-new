
async function getJson(bucket, key){
  if(!bucket || typeof bucket.get !== "function") return null;
  try{
    const obj = await bucket.get(key);
    if(!obj) return null;
    return await obj.json();
  }catch(e){
    return null;
  }
}

export async function loadStructuralData(env, payload){

  const league = payload.league;
  const season = payload.season || "2025-2026";

  const standings = await getJson(
    env.R2_INTEL,
    `intel/standings/${league}/${season}/latest.json`
  );

  const leagueProfile = await getJson(
    env.R2_ARCHIVE,
    `leagues/${league}/profile.json`
  );

  const tableRaw = await getJson(
    env.R2_INTEL,
    `intel/tables/${league}/${season}.json`
  );

  const table = tableRaw?.teams || tableRaw?.table || [];

  return {
    standings,
    leagueProfile,
    table
  };
}

export function buildStructuralFingerprint(structural){

  const tableSorted = Array.isArray(structural.table)
    ? [...structural.table].sort((a,b)=>a.team.localeCompare(b.team))
    : [];

  const standingsSorted = Array.isArray(structural.standings)
    ? [...structural.standings].sort((a,b)=>a.team.localeCompare(b.team))
    : [];

  const tableStamp = tableSorted.length
    ? tableSorted.map(t =>
        `${t.team}|${t.points_per_game||0}|${t.goals_for||0}|${t.goals_against||0}`
      ).join(";")
    : "no-table";

  const standingsStamp = standingsSorted.length
    ? standingsSorted.map(t =>
        `${t.team}|${t.position||0}|${t.goalDiff||0}`
      ).join(";")
    : "no-standings";

  return `${tableStamp}|${standingsStamp}`;
}
