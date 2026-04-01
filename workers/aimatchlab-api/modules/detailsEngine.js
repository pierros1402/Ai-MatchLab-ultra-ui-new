import { evaluateMatch } from "./ai-core/evaluation.model.js";
import { runAiEngine } from "../../_shared/ai-core/index.js";

const VERSION = "4.0.0-details-engine-backbone";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  });
}

async function readIntelCache(env, matchId) {
  const key = `intel/context/${matchId}/latest.json`;

  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

async function fetchFromEngine(env, path) {
  const base = String(env.ENGINE_V1_BASE || "").trim();

  if (!base) {
    throw new Error("missing_ENGINE_V1_BASE");
  }

  const url = `${base}${path}`;
  const res = await fetch(url, {
    headers: {
      "accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`engine_fetch_failed_${res.status}`);
  }

  return res.json();
}

async function findMatchById(env, id) {
  try {
    const data = await fetchFromEngine(env, `/match?id=${encodeURIComponent(id)}`);
    if (!data?.ok || !data?.match) return null;
    return data.match;
  } catch (e) {
    console.log("ENGINE match lookup failed:", e?.message || e);
    return null;
  }
}

function getMonthFromKickoff(match) {
  if (match?.kickoffUtc) {
    const d = new Date(match.kickoffUtc);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 7);
    }
  }

  return new Date().toISOString().slice(0, 7);
}

async function persistToR2(env, match, aiProfile) {
  if (!env.R2_INTEL) return;

  const month = getMonthFromKickoff(match);

  const fileName =
    match.status === "FT" || match.rawStatus === "STATUS_FINAL"
      ? "final.json"
      : "pre.json";

  const key =
    `ai/context/${month}/${match.leagueSlug}/${match.matchId}/${fileName}`;

  try {
    await env.R2_INTEL.put(
      key,
      JSON.stringify(aiProfile),
      { httpMetadata: { contentType: "application/json" } }
    );
  } catch (e) {
    console.error("R2 WRITE FAILED:", e);
  }
}

function mapMatchForAi(match) {
  return {
    id: match.matchId,
    league: match.leagueSlug,
    season: "auto",
    home: match.homeTeam,
    away: match.awayTeam,
    status: match.rawStatus || match.status,
    minute: match.minute || null,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    standings: null,
    live: match.liveStats || null
  };
}

export async function handleDetails(req, env) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const debug = url.searchParams.get("debug") === "1";

  if (!id) {
    return json({ ok: false, error: "missing_id" }, 400);
  }

  const match = await findMatchById(env, id);

  if (!match) {
    return json({ ok: false, error: "match_not_found" }, 404);
  }

  const cachedIntel = await readIntelCache(env, match.matchId);

  if (cachedIntel) {
    return json({
      ok: true,
      basic: match,
      fullAiProfile: cachedIntel,
      cache: "HIT_INTEL",
      meta: {
        generatedAt: cachedIntel.generatedAt || null,
        source: "intel-cache",
        version: VERSION
      },
      debug: !!debug
    });
  }

  const input = mapMatchForAi(match);
  const aiProfile = await runAiEngine(input, env);

  await persistToR2(env, match, aiProfile);

  if (!debug) {
    return json({
      ok: true,
      matchId: match.matchId,
      ...aiProfile
    });
  }

  return json({
    ok: true,
    matchId: match.matchId,
    basic: match,
    fullAiProfile: aiProfile,
    meta: aiProfile.meta || null,
    version: VERSION
  });
}

export async function handleEvaluation(req, env) {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "method_not_allowed" }),
      { status: 405 }
    );
  }

  const body = await req.json();
  const { aiProfile, finalScoreHome, finalScoreAway } = body;

  if (!aiProfile || finalScoreHome == null || finalScoreAway == null) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_data" }),
      { status: 400 }
    );
  }

  const evaluation = evaluateMatch(aiProfile, finalScoreHome, finalScoreAway);

  return new Response(
    JSON.stringify({ ok: true, evaluation }, null, 2),
    { headers: { "content-type": "application/json" } }
  );
}