import { runAiEngine } from "../_shared/ai-core/index.js";
import { runValueEngineCore } from "../_shared/value-engine-core.js";
import { handleOdds } from "./modules/oddsEngine.js";

const ENGINE_VERSION = "2.5.0";
const MAX_LIVE_VERSIONS = 5;

// ============================================================
// DETERMINISTIC HELPERS
// ============================================================

function buildSignature(match) {
  return [
    match.status || "UNKNOWN",
    match.scoreHome ?? 0,
    match.scoreAway ?? 0,
    match.minute ?? 0
  ].join("|");
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function aiBasePath(match) {
  return `ai/context/${currentMonthKey()}/${match.leagueSlug}/${match.id}/`;
}

async function listObjects(env, prefix) {
  const list = await env.R2_INTEL.list({ prefix });
  return list.objects || [];
}

async function deleteObjects(env, keys) {
  for (const k of keys) {
    await env.R2_INTEL.delete(k);
  }
}

// ============================================================
// PERFORMANCE LOGGING
// ============================================================

async function logAiPerformance(match, stage, signature, env) {
  const month = currentMonthKey();
  const key = `ai/performance/${month}/${match.id}-${stage}.json`;

  const payload = {
    matchId: match.id,
    league: match.leagueSlug,
    stage,
    stateSignature: signature,
    engineVersion: ENGINE_VERSION,
    createdAt: Date.now()
  };

  await env.R2_INTEL.put(key, JSON.stringify(payload));
}

// ============================================================
// EVALUATION
// ============================================================

async function evaluateMatch(match, env) {
  const month = currentMonthKey();
  const base = aiBasePath(match);

  const preObj = await env.R2_INTEL.get(base + "pre.json");
  const finalObj = await env.R2_INTEL.get(base + "final.json");

  if (!preObj || !finalObj) return;

  const preData = await preObj.json();
  const finalData = await finalObj.json();

  const home = Number(match.scoreHome || 0);
  const away = Number(match.scoreAway || 0);

  let outcome = "DRAW";
  if (home > away) outcome = "HOME";
  if (away > home) outcome = "AWAY";

  const totalGoals = home + away;
  const over25 = totalGoals > 2.5;

  const evaluation = {
    matchId: match.id,
    league: match.leagueSlug,
    engineVersion: ENGINE_VERSION,
    createdAt: Date.now(),
    realOutcome: outcome,
    realOver25: over25,
    aiPreMeta: preData.meta,
    aiFinalMeta: finalData.meta
  };

  const key = `ai/evaluation/${month}/${match.id}.json`;
  await env.R2_INTEL.put(key, JSON.stringify(evaluation));
}

// ============================================================
// CORE ENGINE
// ============================================================

async function getDeterministicProfile(match, env) {

  const signature = buildSignature(match);
  const base = aiBasePath(match);

  const preKey = base + "pre.json";
  const finalKey = base + "final.json";
  const livePrefix = base + "live/";

  // FINAL CACHE
  if (match.status?.includes("FINAL")) {
    const existing = await env.R2_INTEL.get(finalKey);
    if (existing) {
      const data = await existing.json();
      if (data.meta.engineVersion === ENGINE_VERSION)
        return data;
    }
  }

  // PRE CACHE
  if (match.status?.includes("SCHEDULED")) {
    const existing = await env.R2_INTEL.get(preKey);
    if (existing) {
      const data = await existing.json();
      if (data.meta.engineVersion === ENGINE_VERSION)
        return data;
    }
  }

  // LIVE CACHE
  if (match.status?.includes("IN_PROGRESS")) {
    const liveObjects = await listObjects(env, livePrefix);

    for (const obj of liveObjects) {
      const data = await (await env.R2_INTEL.get(obj.key)).json();
      if (
        data.meta.stateSignature === signature &&
        data.meta.engineVersion === ENGINE_VERSION
      ) {
        return data;
      }
    }
  }

  // GENERATE NEW
  const profile = await runAiEngine({
    id: match.id,
    league: match.leagueSlug,
    home: match.home,
    away: match.away,
    status: match.status,
    minute: match.minute || null,
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    season: "2025-2026"
  }, env);

  const payload = {
    meta: {
      createdAt: Date.now(),
      stateSignature: signature,
      status: match.status,
      engineVersion: ENGINE_VERSION
    },
    profile
  };

  // WRITE LOGIC

  if (match.status?.includes("SCHEDULED")) {
    await env.R2_INTEL.put(preKey, JSON.stringify(payload));
    await logAiPerformance(match, "pre", signature, env);
    return payload;
  }

  if (match.status?.includes("IN_PROGRESS")) {

    const liveKey = livePrefix + Date.now() + ".json";
    await env.R2_INTEL.put(liveKey, JSON.stringify(payload));

    const liveObjects = await listObjects(env, livePrefix);

    if (liveObjects.length > MAX_LIVE_VERSIONS) {
      const sorted = liveObjects.sort(
        (a, b) => new Date(a.uploaded) - new Date(b.uploaded)
      );

      const toDelete = sorted
        .slice(0, liveObjects.length - MAX_LIVE_VERSIONS)
        .map(o => o.key);

      await deleteObjects(env, toDelete);
    }

    return payload;
  }

  if (match.status?.includes("FINAL")) {

    await env.R2_INTEL.put(finalKey, JSON.stringify(payload));
    await logAiPerformance(match, "final", signature, env);

    await evaluateMatch(match, env);

    const liveObjects = await listObjects(env, livePrefix);
    await deleteObjects(env, liveObjects.map(o => o.key));

    return payload;
  }

  return payload;
}

// ============================================================
// WORKER
// ============================================================

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders() });

    const url = new URL(request.url);
    const pathname = url.pathname;

    // ------------------------------------------------------------
    // VERSION
    // ------------------------------------------------------------

    if (pathname === "/version.json")
      return json({ ok: true, version: ENGINE_VERSION });

    // ------------------------------------------------------------
    // FIXTURES
    // ------------------------------------------------------------

    if (pathname === "/fixtures")
      return handleFixtures(url, env);

    if (pathname === "/fixtures-runtime")
      return handleFixturesRuntime(url, env);

    // ------------------------------------------------------------
    // VALUE PICKS (READ)
    // ------------------------------------------------------------

    if (pathname === "/value-picks")
      return handleValuePicks(url, env);

    // ------------------------------------------------------------
    // VALUE ENGINE (RUN)
    // ------------------------------------------------------------

    if (pathname === "/value/run") {

      const date = url.searchParams.get("date");
      const force = url.searchParams.get("force") === "1";

      if (!date)
        return json({ ok:false, error:"missing_date" }, 400);

      try {
        const result = await runValueEngineCore(env, date, { force });
        return json(result);
      } catch (e) {
        console.error("VALUE RUN ERROR:", e);
        return json({ ok:false, error:"value_engine_failed" }, 500);
      }
    }

    // ------------------------------------------------------------
    // ODDS
    // ------------------------------------------------------------

    if (pathname === "/odds" || pathname.startsWith("/odds/"))
      return handleOdds(request, env);

    // ------------------------------------------------------------
    // DETAILS (AI PROFILE)
    // ------------------------------------------------------------

    if (pathname === "/v1/match/details") {

      const id = url.searchParams.get("id");
      const dateParam = url.searchParams.get("date");

      if (!id)
        return json({ ok:false, error:"missing_id" }, 400);

      const today = dayKeyGR();
      const yesterday = dayKeyGR(new Date(Date.now() - 86400000));
      const days = dateParam ? [dateParam] : [today, yesterday];

      let match = null;

      for (const dayKey of days) {

        const bucket =
          await safeKVGet(env, `FIXTURES:DATE:${dayKey}`) ||
          await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`);

        if (!bucket?.matches) continue;

        const found = bucket.matches.find(m => String(m.id) === String(id));

        if (found) {
          match = found;
          break;
        }
      }

      if (!match)
        return json({ ok:false, error:"match_not_found" }, 404);

      let aiProfile = null;

      try {
        aiProfile = await getDeterministicProfile(match, env);
      } catch (e) {
        console.error("AI ERROR:", e);
      }

      return json({
        ok: true,
        basic: match,
        fullAiProfile: aiProfile?.profile
          ? {
              ...aiProfile.profile,
              meta: aiProfile.meta
            }
          : null
      });
    }

    // ------------------------------------------------------------
    // FALLBACK
    // ------------------------------------------------------------

    return json({ ok:false, error:"Not found" }, 404);
  }
};

// ============================================================
// FIXTURES
// ============================================================

async function handleFixtures(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw =
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`);

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, date: dayKey, total: 0, matches: [] });
  }

  return json({
    ok: true,
    date: dayKey,
    total: raw.matches.length,
    matches: raw.matches
  });
}

async function handleFixturesRuntime(url, env) {
  const mode = (url.searchParams.get("mode") || "today").toLowerCase();
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw =
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`);

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, mode, date: dayKey, total: 0, matches: [] });
  }

  const now = Date.now();
  const out = [];

  for (const m of raw.matches) {
    const status = String(m.status || "").toUpperCase();
    const kickoff = Number(m.kickoff_ms || 0);

    const isLive =
      status.includes("IN_PROGRESS");

    const isFinal =
      status.includes("FULL_TIME") ||
      status.includes("FINAL") ||
      status.includes("POST");

    const isScheduled =
      status.includes("SCHEDULED");

    if (mode === "live" && isLive) out.push(m);
    else if (mode === "active" && (isScheduled || isFinal)) out.push(m);
    else if (mode === "today") {
      if (isScheduled || isLive) out.push(m);
      if (isFinal && now - kickoff < 10 * 60 * 1000) out.push(m);
    }
  }

  return json({ ok: true, mode, date: dayKey, total: out.length, matches: out });
}

// ============================================================
// VALUE PICKS
// ============================================================

async function handleValuePicks(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();
  const raw = await safeKVGet(env, `VALUE:SUMMARY:${dayKey}`);

  if (raw && Array.isArray(raw.items)) {
    return json({
      ok: true,
      date: dayKey,
      total: raw.items.length,
      items: raw.items
    });
  }

  return json({ ok: true, date: dayKey, total: 0, items: [] });
}

// ============================================================
// HELPERS
// ============================================================

async function safeKVGet(env, key) {
  try {
    const str = await env.AIML_INGESTION_KV.get(key);
    if (!str) return null;
    return JSON.parse(str);
  } catch { return null; }
}

function dayKeyGR(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Athens",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).format(date);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":"Content-Type"
  };
}

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers:{ "Content-Type":"application/json", ...corsHeaders() }
  });
}
