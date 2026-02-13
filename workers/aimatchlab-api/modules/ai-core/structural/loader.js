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

  return {
    standings,
    leagueProfile
  };
}
