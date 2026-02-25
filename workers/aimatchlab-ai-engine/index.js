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

        const leagues = [
          "eng.1",
          "esp.1",
          "ita.1",
          "ger.1",
          "fra.1",
          "uefa.champions",
          "uefa.europa",
          "uefa.europa.conf"
        ];

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
      // MATCH INTEL (public)
      // ------------------------------------------------------------
      if (pathname === "/ai/match-intel") {
        const id = url.searchParams.get("id");
        if (!id) return json({ ok: false, error: "missing_id" }, 400);

        const { buildMatchIntel } = await import("./engine/intel/match-intel.js");
        const result = await buildMatchIntel(env, id.trim());
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
// DEFAULT
// ------------------------------------------------------------
      return json({ ok: false, error: "invalid_route" }, 404);
    });
  },

  async scheduled(event, env, ctx) {
    // run AI build safely in background
    ctx.waitUntil((async () => {
      const season = "2025-2026";
      const leagues = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];

      const idx = Number(await env.AIML_INGESTION_KV.get("AI_BUILD_IDX")) || 0;
      const league = leagues[idx % leagues.length];

      try {
        await buildSeason(env, league, season);
        console.log("AI build ok:", league);
      } catch (e) {
        // cron must NEVER crash
        console.log("AI build failed:", league, e);
      }

      await env.AIML_INGESTION_KV.put("AI_BUILD_IDX", String((idx + 1) % leagues.length));
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
