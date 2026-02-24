// ============================================================
// AIMATCHLAB AI ENGINE – STABLE CORE v4.2
// - Deterministic Season Builder
// - Standings Safe
// - Integrity Scan
// - Team Context Layer
// ============================================================

import { buildSeason } from "./engine/season-builder.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type"
        }
      });
    }
    const pathname = url.pathname;

    // ------------------------------------------------------------
    // HEALTH
    // ------------------------------------------------------------
    if (pathname === "/ai/health") {
      return json({ ok: true, version: "v4.2-stable-core" });
    }

    // ------------------------------------------------------------
    // BUILD SEASON
    // ------------------------------------------------------------
    if (pathname === "/ai/build-season") {
      const league = url.searchParams.get("league");
      const season = url.searchParams.get("season");

      if (!league || !season) {
        return json({ ok: false, error: "missing_league_or_season" }, 400);
      }

      const result = await buildSeason(env, league, season);
      return json(result);
    }

    // ------------------------------------------------------------
    // BUILD ALL
    // ------------------------------------------------------------
    if (pathname === "/ai/build-all") {
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
          const res = await buildSeason(env, league, season);
          const data = await res.json();
          results.push({ league, ...data });
        } catch {
          results.push({ league, error: true });
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
    return json({ ok:false, error:"missing_params" }, 400);
  }

  const key = `league/${league}/${season}/meta.json`;

  const obj = await env.AI_STATE.get(key);

  if (!obj) {
    return json({ ok:false, error:"no_meta" }, 404);
  }

  let meta;

  try {
    const text = await obj.text();
    meta = JSON.parse(text);
  } catch (e) {
    console.log("meta read failed", e);
    return json({ ok:false, error:"meta_read_failed" }, 500);
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
    // MATCH INTEL
    // ------------------------------------------------------------
    if (pathname === "/ai/match-intel") {
      const id = url.searchParams.get("id");
      if (!id) return json({ ok: false, error: "missing_id" }, 400);
      const { buildMatchIntel } = await import("./engine/intel/match-intel.js");
      const result = await buildMatchIntel(env, id.trim());
      return json(result);
    }
// ------------------------------------------------------------
// CLEAN INVALID LEAGUES (ONE-TIME TOOL)
// ------------------------------------------------------------
if (url.pathname === "/__cleanup-invalid-leagues") {

  const list = await env.AI_STATE.list({ prefix: "league/" });

  for (const obj of list.objects) {
    const key = obj.key;

    const match = key.match(/^league\/([0-9]+)\//);
    if (!match) continue;

    // delete numeric league folder
    await env.AI_STATE.delete(key);
  }

  return json({ ok: true, cleaned: true });
}
    // ------------------------------------------------------------
    // DEFAULT
    // ------------------------------------------------------------
    return json({ ok: false, error: "invalid_route" }, 404);
  },

  async scheduled(event, env, ctx) {

  // run AI build safely in background
  ctx.waitUntil((async () => {

    const season = "2025-2026";

    const leagues = [
      "eng.1",
      "esp.1",
      "ita.1",
      "ger.1",
      "fra.1"
    ];

    // rotation index (quota-safe progression)
    const idx =
      Number(await env.AIML_INGESTION_KV.get("AI_BUILD_IDX")) || 0;

    const league = leagues[idx % leagues.length];

    try {
      await buildSeason(env, league, season);
      console.log("AI build ok:", league);
    } catch (e) {
      // cron must NEVER crash
      console.log("AI build failed:", league, e);
    }

    // advance rotation pointer
    await env.AIML_INGESTION_KV.put(
      "AI_BUILD_IDX",
      String((idx + 1) % leagues.length)
    );

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
      "access-control-allow-headers": "content-type"
    }
  });
}