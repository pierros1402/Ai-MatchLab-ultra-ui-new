import { evaluateMatch } from "./ai-core/evaluation.model.js";
import { runAiEngine } from "../../_shared/ai-core/index.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function findMatchById(env, id) {
  const list = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:" });
  for (const key of list.keys) {
    const bucket = await env.AIML_INGESTION_KV.get(key.name, "json");
    if (!bucket || !bucket.matches) continue;
    const match = bucket.matches.find(m => String(m.id) === String(id));
    if (match) return match;
  }
  return null;
}

async function getStandings(env, leagueSlug, home, away) {
  const key = `STANDINGS:CURRENT:${leagueSlug}`;
  const data = await env.AIML_INGESTION_KV.get(key, "json");
  if (!data || !data.teams) return null;

  return {
    home: data.teams.find(t => t.team === home),
    away: data.teams.find(t => t.team === away)
  };
}

function getMonthFromKickoff(match){
  if (match?.kickoff) {
    const d = new Date(match.kickoff);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0,7);
    }
  }
  return new Date().toISOString().slice(0,7);
}

async function persistToR2(env, match, aiProfile){

  if (!env.R2_INTEL) return;

  const month = getMonthFromKickoff(match);

  const fileName =
    match.status === "STATUS_FINAL"
      ? "final.json"
      : "pre.json";

  const key =
    `ai/context/${month}/${match.leagueSlug}/${match.id}/${fileName}`;

  try{
    await env.R2_INTEL.put(
      key,
      JSON.stringify(aiProfile),
      { httpMetadata: { contentType: "application/json" } }
    );
  }catch(e){
    console.error("R2 WRITE FAILED:", e);
  }
}

export async function handleDetails(req, env) {

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const debug = url.searchParams.get("debug") === "1";
  const refresh = url.searchParams.get("refresh") === "1";
  const check = url.searchParams.get("check") === "1";

  if (!id) return json({ ok:false, error:"missing_id" }, 400);

  const match = await findMatchById(env, id);
  if (!match) return json({ ok:false, error:"match_not_found" }, 404);

  const standings = await getStandings(
    env,
    match.leagueSlug,
    match.home,
    match.away
  );

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
    standings,
    live: match.liveStats || null
  };

  const aiProfile = await runAiEngine(input, env);

  // 🔵 NEW — ALWAYS PERSIST (refresh or check or normal call)
  if (refresh || check || true) {
    await persistToR2(env, match, aiProfile);
  }

  if (!debug) {
    return json({
      ok:true,
      matchId: match.id,
      ...aiProfile
    });
  }

  return json({
    ok: true,
    matchId: match.id,
    fullAiProfile: aiProfile,
    cache: aiProfile.cache,
    meta: aiProfile.meta
  });
}

export async function handleEvaluation(req, env) {

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok:false, error:"method_not_allowed" }), { status:405 });
  }

  const body = await req.json();

  const { aiProfile, finalScoreHome, finalScoreAway } = body;

  if (!aiProfile || finalScoreHome == null || finalScoreAway == null) {
    return new Response(JSON.stringify({ ok:false, error:"missing_data" }), { status:400 });
  }

  const evaluation = evaluateMatch(aiProfile, finalScoreHome, finalScoreAway);

  return new Response(JSON.stringify({
    ok:true,
    evaluation
  }, null, 2), {
    headers:{ "content-type":"application/json" }
  });
}
