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

      return buildSeason(env, league, season);
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
    // DEFAULT
    // ------------------------------------------------------------
    return json({ ok: false, error: "invalid_route" }, 404);
  },

  async scheduled(event, env, ctx) {
    const leagues = [
      "eng.1",
      "esp.1",
      "ita.1",
      "ger.1",
      "fra.1"
    ];

    for (const league of leagues) {
      try {
        await buildSeason(env, league, "2025-2026");
      } catch (_) {
        // fail silently – cron must never crash
      }
    }
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}