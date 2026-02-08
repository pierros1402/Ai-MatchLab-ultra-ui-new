/**
 * AI MATCHLAB LIVE MATCH WORKER
 * Version: 2.2.0
 * Created: 2026-02-07
 * Architecture Phase: LIVE-MATCH-INTELLIGENCE
 */

const VERSION = "2.2.0";
const CREATED = "2026-02-07";
const TTL = 90;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json",
  };
}

function safe(v, d = null) {
  return v === undefined || v === null ? d : v;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function extractStat(statsArr, key) {
  if (!Array.isArray(statsArr)) return 0;
  const found = statsArr.find(s => s?.name === key);
  return toNum(found?.displayValue);
}

function ratio(a, b) {
  if (!b || b === 0) return 0;
  return a / b;
}

function normalizeDiff(a, b) {
  const total = a + b;
  if (!total) return 0;
  return (a - b) / total;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

async function safeFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res || !res.ok) return { ok: false, data: null };
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, data: null };
    }
  } catch {
    return { ok: false, data: null };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors() });

    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        ok: true,
        service: "aiml-live-match-worker",
        version: VERSION,
        created: CREATED
      }), { headers: cors() });
    }

    if (!url.pathname.startsWith("/api/match-live"))
      return new Response(JSON.stringify({ ok:false }), { status:404, headers:cors() });

    const id = url.searchParams.get("id");
    if (!id)
      return new Response(JSON.stringify({ ok:false, error:"missing_id" }), { status:400, headers:cors() });

    const cacheKey = "LIVE_MATCH:" + id;

    if (env?.AIML_DETAILS_CACHE) {
      try {
        const cached = await env.AIML_DETAILS_CACHE.get(cacheKey);
        if (cached) return new Response(cached, { headers: cors() });
      } catch {}
    }

    const api = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`;
    const result = await safeFetchJson(api);

    if (!result.ok || !result.data) {
      return new Response(JSON.stringify({
        ok:false,
        service:"aiml-live-match-worker",
        version:VERSION,
        created:CREATED,
        reason:"summary_unavailable",
        basic:{},
        stats:{},
        live_intel:{},
        events:[]
      }), { headers:cors() });
    }

    const data = result.data;
    const comp = data?.header?.competitions?.[0] || {};
    const teams = Array.isArray(comp?.competitors) ? comp.competitors : [];

    const homeObj = teams.find(t => t.homeAway === "home") || teams[0] || {};
    const awayObj = teams.find(t => t.homeAway === "away") || teams[1] || {};

    const homeStats = data?.boxscore?.teams?.find(t => t.homeAway === "home")?.statistics || [];
    const awayStats = data?.boxscore?.teams?.find(t => t.homeAway === "away")?.statistics || [];

    const stats = {
      shots_home: extractStat(homeStats, "totalShots"),
      shots_away: extractStat(awayStats, "totalShots"),
      shots_ot_home: extractStat(homeStats, "shotsOnTarget"),
      shots_ot_away: extractStat(awayStats, "shotsOnTarget"),
      possession_home: extractStat(homeStats, "possessionPct"),
      possession_away: extractStat(awayStats, "possessionPct"),
      fouls_home: extractStat(homeStats, "foulsCommitted"),
      fouls_away: extractStat(awayStats, "foulsCommitted"),
      yellow_home: extractStat(homeStats, "yellowCards"),
      yellow_away: extractStat(awayStats, "yellowCards"),
      red_home: extractStat(homeStats, "redCards"),
      red_away: extractStat(awayStats, "redCards"),
      corners_home: extractStat(homeStats, "wonCorners"),
      corners_away: extractStat(awayStats, "wonCorners"),
      passes_home: extractStat(homeStats, "totalPasses"),
      passes_away: extractStat(awayStats, "totalPasses")
    };

    const possession_diff = normalizeDiff(stats.possession_home, stats.possession_away);
    const shots_diff = normalizeDiff(stats.shots_home, stats.shots_away);
    const shots_ot_diff = normalizeDiff(stats.shots_ot_home, stats.shots_ot_away);
    const passes_diff = normalizeDiff(stats.passes_home, stats.passes_away);
    const corners_diff = normalizeDiff(stats.corners_home, stats.corners_away);

    const dominance_raw =
      0.3 * possession_diff +
      0.25 * shots_diff +
      0.25 * shots_ot_diff +
      0.1 * passes_diff +
      0.1 * corners_diff;

    const dominance_home = Math.round(sigmoid(dominance_raw * 5) * 100);
    const dominance_away = 100 - dominance_home;

    const pressure_home = Math.min(100,
      stats.shots_home * 2 +
      stats.shots_ot_home * 3 +
      stats.corners_home * 2
    );

    const pressure_away = Math.min(100,
      stats.shots_away * 2 +
      stats.shots_ot_away * 3 +
      stats.corners_away * 2
    );

    const card_risk_home = Math.min(100,
      stats.fouls_home * 2 +
      stats.yellow_home * 10 +
      stats.red_home * 25
    );

    const card_risk_away = Math.min(100,
      stats.fouls_away * 2 +
      stats.yellow_away * 10 +
      stats.red_away * 25
    );

    const finishing_eff_home = ratio(stats.shots_ot_home, stats.shots_home);
    const finishing_eff_away = ratio(stats.shots_ot_away, stats.shots_away);

    let momentum_bias = "neutral";
    if (dominance_home > 60) momentum_bias = "home";
    if (dominance_home < 40) momentum_bias = "away";

    let state_flag = "balanced";
    const scoreHome = toNum(homeObj?.score);
    const scoreAway = toNum(awayObj?.score);

    if (scoreHome > scoreAway && dominance_home < 50)
      state_flag = "home_leading_under_pressure";
    else if (scoreAway > scoreHome && dominance_home > 50)
      state_flag = "away_leading_under_pressure";

    const payload = {
      ok:true,
      service:"aiml-live-match-worker",
      version:VERSION,
      created:CREATED,
      basic:{
        home: safe(homeObj?.team?.displayName),
        away: safe(awayObj?.team?.displayName),
        scoreHome,
        scoreAway,
        status: safe(comp?.status?.type?.state),
        minute: safe(comp?.status?.displayClock),
        venue: safe(comp?.venue?.fullName)
      },
      stats,
      live_intel:{
        dominance_home,
        dominance_away,
        pressure_home,
        pressure_away,
        card_risk_home,
        card_risk_away,
        finishing_eff_home: Number(finishing_eff_home.toFixed(2)),
        finishing_eff_away: Number(finishing_eff_away.toFixed(2)),
        momentum_bias,
        state_flag
      },
      events: Array.isArray(data?.plays) ? data.plays : []
    };

    const json = JSON.stringify(payload);

    if (env?.AIML_DETAILS_CACHE) {
      try {
        await env.AIML_DETAILS_CACHE.put(cacheKey, json, { expirationTtl: TTL });
      } catch {}
    }

    return new Response(json, { headers:cors() });
  }
};
