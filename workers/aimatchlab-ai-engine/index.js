// ============================================================
// AIMATCHLAB AI ENGINE – STABLE CORE v4.3 OPS
// - Deterministic Season Builder
// - Standings Safe
// - Integrity Scan
// - Team/Matchup Context
// - Match Intel
// - Ops: safe router, system health/metrics, protected internal tools
// ============================================================

import { buildSeason } from "./engine/season-builder.js";
import { LEAGUE_SEEDS } from "./_shared/leagues-registry.js";
const ENGINE_VERSION = "v4.3-ops";

// -----------------------------
// OPS HELPERS
// -----------------------------
function requireInternal(request, env) {
  const expected = env?.INTERNAL_SECRET;
  if (!expected) return false; // if not configured, treat as locked
  const got =
    request.headers.get("x-aiml-secret") ||
    request.headers.get("x-internal-secret") ||
    "";
  return got === expected;
}

async function safeExec(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("[AI_ENGINE_FATAL]", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return safeExec(async () => {
      const url = new URL(request.url);

      // ------------------------------------------------------------
      // CORS (preflight)
      // ------------------------------------------------------------
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,OPTIONS",
            "access-control-allow-headers": "content-type,x-aiml-secret,x-internal-secret"
          }
        });
      }

      const pathname = url.pathname;

      // ------------------------------------------------------------
      // HEALTH (legacy)
      // ------------------------------------------------------------
      if (pathname === "/ai/health") {
        return json({ ok: true, version: ENGINE_VERSION });
      }

      // ------------------------------------------------------------
      // SYSTEM HEALTH (ops)
      // ------------------------------------------------------------
      if (pathname === "/system/health") {
        const now = Date.now();

        let schedulerTick = null;
        try {
          schedulerTick = await env.AIML_INGESTION_KV.get("SCHEDULER:LAST_TICK");
        } catch (_) {}

        let aiBuildIdx = null;
        try {
          aiBuildIdx = await env.AIML_INGESTION_KV.get("AI_BUILD_IDX");
        } catch (_) {}

        return json({
          ok: true,
          service: "aimatchlab-ai-engine",
          version: ENGINE_VERSION,
          ts: now,
          scheduler: {
            lastTick: schedulerTick ? JSON.parse(schedulerTick) : null
          },
          ai: {
            buildIdx: aiBuildIdx ? Number(aiBuildIdx) : 0
          }
        });
      }

      // ------------------------------------------------------------
      // SYSTEM METRICS (lightweight)
      // ------------------------------------------------------------
      if (pathname === "/system/metrics") {
        // KV counts are approximate due to pagination limits; keep it cheap.
        const out = { ok: true, ts: Date.now(), kv: {}, r2: {} };

        try {
          const a = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:STAGING:DATE:" });
          const b = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:DATE:" });
          out.kv.stagingDays = a?.keys?.length ?? 0;
          out.kv.finalDays = b?.keys?.length ?? 0;
        } catch (_) {}

        try {
          const list = await env.AI_STATE.list({ prefix: "intel/context/" });
          out.r2.intelObjects = list?.objects?.length ?? 0;
        } catch (_) {}

        return json(out);
      }

      // ------------------------------------------------------------
      // BUILD SEASON (INTERNAL)
      // ------------------------------------------------------------
      if (pathname === "/ai/build-season") {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_league_or_season" }, 400);
        }

        const result = await buildSeason(env, league, season);
        return json(result);
      }

      // ------------------------------------------------------------
      // BUILD ALL (INTERNAL)
      // ------------------------------------------------------------
      if (pathname === "/ai/build-all") {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        const season = url.searchParams.get("season");
        if (!season) {
          return json({ ok: false, error: "missing_season" }, 400);
        }

        // discover leagues dynamically from AI_STATE
        const listed = await env.AI_STATE.list({
          prefix: "league/"
        });

        const leaguesSet = new Set();

        for (const obj of listed.objects || []) {
         const parts = obj.key.split("/");
         // league/<league>/<season>/...
         if (parts.length >= 3) {
           leaguesSet.add(parts[1]);
         }
        }

        const leagues = [...leaguesSet];

        const results = [];

        for (const league of leagues) {
          try {
            const data = await buildSeason(env, league, season);
            results.push({ league, ...data, ok: true });
          } catch (e) {
            console.error("[BUILD_ALL_FAIL]", league, e);
            results.push({ league, ok: false, error: true });
          }
        }

        return json({ ok: true, season, results });
      }

      // ------------------------------------------------------------
      // LEAGUE STATE DEBUG
      // ------------------------------------------------------------
      if (pathname === "/ai/league-state") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const key = `league/${league}/${season}/meta.json`;
        const obj = await env.AI_STATE.get(key);

        if (!obj) {
          return json({ ok: false, error: "no_meta" }, 404);
        }

        let meta;
        try {
          meta = JSON.parse(await obj.text());
        } catch (e) {
          console.log("meta read failed", e);
          return json({ ok: false, error: "meta_read_failed" }, 500);
        }

        return json({
          ok: true,
          league,
          season,
          leagueVersion: meta.leagueVersion ?? 0,
          rankingHash: meta.rankingHash ?? null
        });
      }

      // ------------------------------------------------------------
      // TEAM CONTEXT
      // ------------------------------------------------------------
      if (pathname === "/ai/team-context") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");
        const team = url.searchParams.get("team");

        if (!league || !season || !team) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const { buildTeamContext } = await import("./engine/context/team-context.js");
        const result = await buildTeamContext(env, league, season, team);
        return json(result);
      }

      // ------------------------------------------------------------
      // MATCHUP CONTEXT
      // ------------------------------------------------------------
      if (pathname === "/ai/matchup-context") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");
        const home = url.searchParams.get("home");
        const away = url.searchParams.get("away");

        if (!league || !season || !home || !away) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const { buildMatchupContext } = await import("./engine/context/matchup-context.js");
        const result = await buildMatchupContext(env, league, season, home, away);
        return json(result);
      }

      // ------------------------------------------------------------
      // INTEGRITY SCAN
      // ------------------------------------------------------------
      if (pathname === "/ai/scan-integrity") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_league_or_season" }, 400);
        }

        const { scanIntegrity } = await import("./engine/integrity-scan.js");
        return scanIntegrity(env, league, season);
      }

// ------------------------------------------------------------
// INTEL TIMELINE (PHASE MEMORY)
// ------------------------------------------------------------
if (pathname === "/ai/intel-timeline") {
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  // (optional) keep same protection policy as /ai/match-intel
  // If your /ai/match-intel requires internal auth, copy the same check here.
  // Example:
  // const secret = req.headers.get("x-internal-secret");
  // if (secret !== env.INTERNAL_SECRET) return json({ ok:false, error:"unauthorized" }, 401);

  const key = `intel/context/${id}/timeline.json`;

  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return json({ ok: true, id, timeline: [], cache: "MISS" });

    const text = await obj.text();
    let timeline = [];
    try {
      const parsed = JSON.parse(text);
      timeline = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}

    return json({ ok: true, id, timeline, cache: "HIT" });
  } catch (e) {
    return json({ ok: false, error: "read_failed", id }, 500);
  }
}

// ------------------------------------------------------------
// INTEL SIGNALS (READ LOG)
// ------------------------------------------------------------
if (pathname === "/ai/intel-signals") {

  const matchId = url.searchParams.get("id");

  if (!matchId) {
    return json({ ok: false, error: "missing_id" }, 400);
  }

  const key = `intel/context/${matchId}/signal-log.json`;

  try {
    const obj = await env.AI_STATE.get(key);

    if (!obj) {
      return json({
        ok: true,
        matchId,
        signals: []
      });
    }

    const signals = JSON.parse(await obj.text());

    return json({
      ok: true,
      matchId,
      signals
    });

  } catch (e) {
    console.log("[INTEL SIGNAL READ FAIL]", e);

    return json({
      ok: false,
      error: "read_failed"
    }, 500);
  }
}

// ------------------------------------------------------------
// MATCH INTEL (public) — PERSISTENT CACHE ENABLED
// ------------------------------------------------------------
if (pathname === "/ai/match-intel") {

  const id = url.searchParams.get("id");
  if (!id) return json({ ok:false, error:"missing_id" }, 400);

  const matchId = id.trim();
  const cacheKey = `intel/context/${matchId}/latest.json`;



// ==============================
// CACHE READ (POINTER RESOLVE)
// ==============================
const force = typeof matchId === "string" && matchId.includes("|force");

if (!force) {
  try {
    const cached = await env.AI_STATE.get(cacheKey);

    if (cached) {
      const pointer = await cached.json();

      if (pointer?.latest) {
        const latestObj = await env.AI_STATE.get(pointer.latest);

        if (latestObj) {
          const data = await latestObj.json();
          data.cache = "HIT";
          return json(data);
        }
      }
    }
  } catch (e) {
    console.log("[INTEL CACHE READ FAIL]", e);
  }
} else {
  console.log("[INTEL FORCE] bypass pointer cache", matchId);
}  // ==============================
  // COMPUTE INTEL
  // ==============================
  const { buildMatchIntel } =
    await import("./engine/intel/match-intel.js");

  const result = await buildMatchIntel(env, matchId);

// ==============================
// VERSIONED INTEL WRITE
// ==============================
try {

  const versionTs = Date.now();

  const versionKey =
    `intel/context/${matchId}/versions/${versionTs}.json`;

  // ---------------------------------
  // WRITE VERSION SNAPSHOT
  // ---------------------------------
  await env.AI_STATE.put(
    versionKey,
    JSON.stringify(result),
    {
      httpMetadata: {
        contentType: "application/json"
      }
    }
  );

  // ---------------------------------
  // WRITE POINTER (latest.json)
  // ---------------------------------
  await env.AI_STATE.put(
    cacheKey,
    JSON.stringify({
      latest: versionKey,
      ts: versionTs,
      phase: result?.meta?.phase || "UNKNOWN"
    }),
    {
      httpMetadata: {
        contentType: "application/json"
      }
    }
  );

  result.cache = "MISS";

} catch (e) {
  console.log("[INTEL VERSION WRITE FAIL]", e);
}


// =====================================
// CLEANUP AFTER FINAL PHASE
// =====================================
try {
  if (result?.meta?.phase === "FINAL") {
    await env.AIML_INGESTION_KV.delete(`INTEL:TICK:${matchId}`);
    await env.AIML_INGESTION_KV.delete(`INTEL:PRELOCK:${matchId}`);
    console.log("[INTEL CLEANUP]", matchId);
  }
} catch (e) {
  console.log("[INTEL CLEANUP FAIL]", e);
}

return json(result);
}
      
      // ------------------------------------------------------------
      // CLEAN INVALID LEAGUES (INTERNAL ONE-TIME TOOL)
      // ------------------------------------------------------------
      if (pathname === "/__cleanup-invalid-leagues") {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        const list = await env.AI_STATE.list({ prefix: "league/" });
        let deleted = 0;

        for (const obj of list.objects || []) {
          const key = obj.key;
          const match = key.match(/^league\/([0-9]+)\//);
          if (!match) continue;
          await env.AI_STATE.delete(key);
          deleted++;
        }

        return json({ ok: true, deleted });
      }
// ------------------------------------------------------------
// AUTO BUILD ALL LEAGUES (DISCOVERY MODE)
// ------------------------------------------------------------
if (pathname === "/ai/build-all-auto") {

  if (!requireInternal(request, env)) {
    return json({ ok:false, error:"unauthorized" }, 403);
  }

  const season = url.searchParams.get("season");
  if (!season) {
    return json({ ok:false, error:"missing_season" }, 400);
  }

  // Discover leagues from R2
  const listed = await env.AI_STATE.list({
    prefix: "league/"
  });

  const leagues = new Set();

  for (const obj of listed.objects || []) {
    const parts = obj.key.split("/");
    // league/<league>/<season>/...
    if (parts.length >= 3) {
      leagues.add(parts[1]);
    }
  }

  const results = [];

  for (const league of leagues) {
    try {
      const res = await buildSeason(env, league, season);
      results.push({ league, ok:true, res });
    } catch (e) {
      console.error("[BUILD_AUTO_FAIL]", league, e);
      results.push({ league, ok:false, error:String(e) });
    }
  }

  return json({
    ok:true,
    leagues:[...leagues],
    total: leagues.size,
    results
  });
}    

// ------------------------------------------------------------
// SEASON COMPLETION
// ------------------------------------------------------------
if (pathname === "/ai/season-completion") {

  const league = url.searchParams.get("league");
  const season = url.searchParams.get("season");

  if (!league || !season) {
    return json({
      ok: false,
      error: "missing_params"
    }, 400);
  }

  const { analyzeSeasonCompletion } =
    await import("./engine/season-builder.js");

  const result =
    await analyzeSeasonCompletion(env, league, season);

  return json({
    ok: true,
    ...result
  });
}

// ------------------------------------------------------------
// INTEL HEALTH CHECK (FULL SYSTEM DIAGNOSTIC)
// ------------------------------------------------------------
if (pathname === "/ai/intel-health") {

  const matchId = url.searchParams.get("id");

  if (!matchId) {
    return json({ ok:false, error:"missing_id" },400);
  }

  try {

    const key = `intel/context/${matchId}/latest.json`;
    const obj = await env.AI_STATE.get(key);

    if (!obj) {
      return json({
        ok:false,
        error:"no_intel_snapshot"
      },404);
    }

    const pointer = JSON.parse(await obj.text());

    let intel = pointer;

    if (pointer?.latest) {
      const latestObj = await env.AI_STATE.get(pointer.latest);
      if (latestObj) {
        intel = JSON.parse(await latestObj.text());
      }
    }
    // ---------------------------------
    // LOAD TIMELINE
    // ---------------------------------
    let timeline = [];

    try {
      const timelineObj =
        await env.AI_STATE.get(`intel/context/${matchId}/timeline.json`);

      if (timelineObj) {
        const parsed = JSON.parse(await timelineObj.text());
        if (Array.isArray(parsed)) {
          timeline = parsed;
        }
      }
    } catch (_) {}    

    const health = {
      ok:true,

      intel: !!intel,
      delta: !!intel.delta,
      narrative: !!intel.narrative,
      confidence: !!intel.confidence,
      signals: Array.isArray(intel.signals) && intel.signals.length > 0,
      timeline: Array.isArray(timeline) && timeline.length > 0,

      reactiveReady:
        Array.isArray(intel.signals) &&
        intel.signals.some(s =>
          ["GOAL_EVENT","VOLATILITY_SPIKE"].includes(s.type)
        )
    };

    return json(health);

  } catch (e) {
    return json({
      ok:false,
      error:"health_check_failed"
    },500);
  }
}
 
// ------------------------------------------------------------
// DEFAULT
// ------------------------------------------------------------
      return json({ ok: false, error: "invalid_route" }, 404);
    });
  },

async scheduled(event, env, ctx) {

  ctx.waitUntil((async () => {

    const season = "2025-2026";

    const leagues = LEAGUE_SEEDS || [];

    if (!leagues.length) {
      console.log("[AI BUILD] no leagues found");
      return;
    }

    let idx =
      Number(await env.AIML_INGESTION_KV.get("AI_BUILD_IDX")) || 0;

    const MAX_PER_CRON = 3;
    const end = Math.min(idx + MAX_PER_CRON, leagues.length);

    console.log("[AI BUILD] start", idx, "→", end);

    for (let i = idx; i < end; i++) {
      const league = leagues[i];

      try {
        await buildSeason(env, league, season);
        console.log("[AI BUILD OK]", league);
      } catch (e) {
        console.log("[AI BUILD FAIL]", league, e);
      }
    }

    let next = end;
    if (next >= leagues.length) {
      next = 0;
      console.log("[AI BUILD] FULL CYCLE COMPLETED");
    }

    await env.AIML_INGESTION_KV.put("AI_BUILD_IDX", String(next));

  })());
}
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,x-aiml-secret,x-internal-secret"
    }
  });
}
