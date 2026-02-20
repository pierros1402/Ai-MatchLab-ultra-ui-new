import { runAiEngine } from "./ai-core/index.js";

export async function buildAndPersistAI(env, match){

  const input = {
    id: match.id,
    league: match.leagueSlug,
    season: "auto",
    home: match.home,
    away: match.away,
    status: match.status,
    minute: match.minute || null,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    standings: null,
    live: match.liveStats || null
  };

  const aiProfile = await runAiEngine(input, env);

  const month =
    match.kickoff
      ? new Date(match.kickoff).toISOString().slice(0,7)
      : new Date().toISOString().slice(0,7);

  const key =
    `ai/context/${month}/${match.leagueSlug}/${match.id}/pre.json`;

  await env.R2_INTEL.put(
    key,
    JSON.stringify(aiProfile),
    { httpMetadata:{ contentType:"application/json" } }
  );

  return aiProfile;
}
