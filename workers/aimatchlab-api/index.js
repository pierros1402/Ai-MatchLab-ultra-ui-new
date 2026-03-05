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
    // SYSTEM STATUS (ops)
    // ------------------------------------------------------------
    if (pathname === "/system/status") {
      const now = Date.now();

      let sched = null;
      try {
        const raw = await env.AIML_INGESTION_KV.get("SCHEDULER:LAST_TICK");
        sched = raw ? JSON.parse(raw) : null;
      } catch (_) {}

      // lightweight KV counts (single page)
      let kvCounts = {};
      try {
        const a = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:STAGING:DATE:" });
        const b = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:DATE:" });
        kvCounts = {
          stagingDays: a?.keys?.length ?? 0,
          finalDays: b?.keys?.length ?? 0
        };
      } catch (_) {}

      return json({
        ok: true,
        ts: now,
        scheduler: sched,
        kv: kvCounts
      });
    }

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

    // ---------------------------------
    // VALUE EXECUTION LOCK (ANTI DOUBLE RUN)
    // ---------------------------------
    const lockKey = `VALUE:RUNNING:${date}`;

    const running =
      await env.AIML_INGESTION_KV.get(lockKey);

    if (running && !force) {
      console.log("[value] already running — skip", date);
      return json({ ok:true, skipped:"already_running" });
    }

    // 15 minute execution lock
    await env.AIML_INGESTION_KV.put(
      lockKey,
      Date.now().toString(),
      { expirationTtl: 900 }
    );

    console.log("[value] build start", date);

    // ---------------------------------
    // RUN VALUE ENGINE
    // ---------------------------------
    const result =
      await runValueEngineCore(env, date, { force });

    console.log("[value] build completed", date);

    return json(result);

  } catch (e) {
    console.error("VALUE RUN ERROR:", e);
    return json({ ok:false, error:"value_engine_failed" }, 500);
  }
}
    // ------------------------------------------------------------
    // ODDS
    // ------------------------------------------------------------

    if (
      pathname === "/odds" ||
      pathname.startsWith("/odds/") ||
      pathname === "/api/odds" ||
      pathname.startsWith("/api/odds/")
    ) {
      return handleOdds(request, env);
    }

// ------------------------------------------------------------
// AI MATCH INTEL (PROXY → AI ENGINE)
// ------------------------------------------------------------
if (pathname === "/ai/match-intel") {

  const id = url.searchParams.get("id");

  if (!id)
    return json({ ok:false, error:"missing_id" }, 400);

  try {

    const aiUrl =
      `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel?id=${encodeURIComponent(id)}`;

    const res = await fetch(aiUrl);

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers:{
        "Content-Type":"application/json",
        ...corsHeaders()
      }
    });

  } catch(e) {

    console.log("[AI PROXY FAIL]", e);

    return json({
      ok:false,
      error:"ai_engine_unreachable"
    },500);

  }
}

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

        const raw =
          await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`) ||
          await safeKVGet(env, `FIXTURES:DATE:${dayKey}`);

        if (!raw?.matches) continue;

        const found = raw.matches.find(m => String(m.id) === String(id));

        if (found) {
          match = found;
          break;
        }
      }

      if (!match)
        return json({ ok:false, error:"match_not_found" }, 404);

      // ===============================
      // INTEL CACHE FIRST (AI ENGINE)
      // ===============================
      try {

        const intelKey = `intel/context/${match.id}/latest.json`;
        const intelObj = await env.AI_STATE.get(intelKey);

        if (intelObj) {
          const intel = await intelObj.json();

          return json({
            ok: true,
            basic: match,
            fullAiProfile: {
              ...intel,
              cache: undefined   // αφαιρεί το εσωτερικό cache field
            },
            cache: "HIT_INTEL"
          });
        }

      } catch(e) {
        console.log("INTEL READ FAIL:", e);
      }

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
// LEAGUE API LAYER (FULL)
// ------------------------------------------------------------
if (pathname.startsWith("/league/")) {

  const parts = pathname.split("/").filter(Boolean);
  // league / eng.1 / 2025-2026 / resource / optional

  if (parts.length < 4) {
    return json({ ok:false, error:"invalid_league_route" }, 400);
  }

  const league = parts[1];
  const season = parts[2];
  const resource = parts[3];

  const basePrefix = `league/${league}/${season}/`;

  // --------------------------------------------------
  // META
  // --------------------------------------------------
  if (resource === "meta") {

    const obj = await env.AI_STATE.get(basePrefix + "meta.json");
    if (!obj)
      return json({ ok:false, error:"meta_not_found" }, 404);

    return new Response(await obj.text(), {
      headers:{ "Content-Type":"application/json", ...corsHeaders() }
    });
  }

  // --------------------------------------------------
  // TABLE
  // --------------------------------------------------
  if (resource === "table") {

    const obj = await env.AI_STATE.get(basePrefix + "table.json");
    if (!obj)
      return json({ ok:false, error:"table_not_found" }, 404);

    return new Response(await obj.text(), {
      headers:{ "Content-Type":"application/json", ...corsHeaders() }
    });
  }

  // --------------------------------------------------
  // COMPLETION
  // --------------------------------------------------
if (resource === "completion") {

  try {

    const engineUrl =
      `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/season-completion` +
      `?league=${league}&season=${season}`;

    const res = await fetch(engineUrl);

    if (!res.ok) {
      return json({ ok:false, error:"engine_error" }, 500);
    }

    const data = await res.json();
    return json(data);

  } catch (e) {
    console.error("completion proxy error", e);
    return json({ ok:false, error:"completion_failed" }, 500);
  }
}

  // --------------------------------------------------
  // SINGLE MATCH (R2 STATE)
  // --------------------------------------------------
  if (resource === "match" && parts.length === 5) {

    const matchId = parts[4];
    const key = basePrefix + `matches/${matchId}.json`;

    const obj = await env.AI_STATE.get(key);
    if (!obj)
      return json({ ok:false, error:"match_not_found" }, 404);

    return new Response(await obj.text(), {
      headers:{ "Content-Type":"application/json", ...corsHeaders() }
    });
  }

  return json({ ok:false, error:"resource_not_supported" }, 404);
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

  // ACTIVE DAY FIRST
  const raw =
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`);

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, mode, date: dayKey, total: 0, matches: [] });
  }

  function isLiveStatus(status) {
    const s = String(status || "").toUpperCase();

    return (
      s.includes("IN_PROGRESS") ||
      s.includes("FIRST_HALF") ||
      s.includes("SECOND_HALF") ||
      s.includes("HALF_TIME") ||
      s.includes("EXTRA_TIME")
    );
  }

  const now = Date.now();
  const out = [];

  for (const m of raw.matches) {

    const status = String(m.status || "").toUpperCase();
    const kickoff = Number(m.kickoff_ms || 0);

    const isLive = isLiveStatus(status);

    const isFinal =
      status.includes("FULL_TIME") ||
      status.includes("FINAL") ||
      status.includes("POST");

    const isScheduled =
      status.includes("SCHEDULED");

    if (mode === "live" && isLive) {
      out.push(m);
      continue;
    }

    if (mode === "active" && (isScheduled || isLive)) {
      out.push(m);
      continue;
    }

    if (mode === "today") {
      if (isScheduled || isLive) {
        out.push(m);
        continue;
      }

      // keep very recent FT
      if (isFinal && now - kickoff < 10 * 60 * 1000) {
        out.push(m);
      }
    }
  }

  return json({
    ok: true,
    mode,
    date: dayKey,
    total: out.length,
    matches: out
  });
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
