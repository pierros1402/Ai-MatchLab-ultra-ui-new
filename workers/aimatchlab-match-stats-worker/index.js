// aimatchlab-match-stats-worker
// Version: v1.1.0
// Compute-only stats worker with built-in test mode

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // ================================
    // TEST MODE (GET /test)
    // ================================
    if (req.method === "GET" && url.pathname === "/test") {
      const payload = buildTestPayload();
      return runCompute(payload, env, true);
    }

    // ================================
    // PROD MODE (POST /)
    // ================================
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return json({ status: "error", error: "Invalid JSON" }, 400);
    }

    return runCompute(payload, env, false);
  }
};

// ================================
// CORE RUNNER
// ================================
async function runCompute(payload, env, isTest) {
  const { matchId, league, season, scope, home, away } = payload || {};

  if (!matchId || !home?.matches || !away?.matches) {
    return json({ status: "error", error: "Invalid input contract" }, 400);
  }

  const windowSize = scope?.window || 10;

  const homeStats = computeStats(home.matches, windowSize);
  const awayStats = computeStats(away.matches, windowSize);
  const derived = computeDerived(homeStats, awayStats, windowSize);

  const output = {
    status: "ok",
    matchId,
    league,
    season,
    scope: {
      window: windowSize,
      type: scope?.type || "league",
      homeAwaySplit: true
    },
    stats: {
      home: homeStats,
      away: awayStats
    },
    derived,
    meta: {
      generatedBy: "aimatchlab-match-stats-worker",
      testMode: isTest,
      updatedAt: new Date().toISOString()
    }
  };

  const key = `intel/match/${matchId}/stats.json`;

  await env.AIMATCHLAB_R2.put(key, JSON.stringify(output), {
    httpMetadata: { contentType: "application/json" }
  });

  return json({
    status: "ok",
    test: isTest,
    written: key,
    sample: {
      home: homeStats.sample,
      away: awayStats.sample
    }
  });
}

// ================================
// STATS COMPUTE
// ================================
function computeStats(matches, windowSize) {
  const n = Math.min(matches.length, windowSize);
  if (n < 8) return { status: "insufficient_sample", sample: n };

  let gf = 0, ga = 0, cs = 0, fts = 0;
  let sot = 0, sota = 0, xgf = 0, xga = 0;

  for (let i = 0; i < n; i++) {
    const m = matches[i];
    gf += m.goals_for ?? 0;
    ga += m.goals_against ?? 0;
    sot += m.shots_on_target ?? 0;
    sota += m.shots_on_target_against ?? 0;
    xgf += m.xg_for ?? 0;
    xga += m.xg_against ?? 0;

    if ((m.goals_against ?? 0) === 0) cs++;
    if ((m.goals_for ?? 0) === 0) fts++;
  }

  return {
    avg_goals_for: round(gf / n),
    avg_goals_against: round(ga / n),
    clean_sheets_pct: round((cs / n) * 100),
    failed_to_score_pct: round((fts / n) * 100),
    shots_on_target_avg: round(sot / n),
    shots_allowed_on_target_avg: round(sota / n),
    xg_for_avg: round(xgf / n),
    xg_against_avg: round(xga / n),
    sample: n
  };
}

// ================================
// DERIVED LABELS
// ================================
function computeDerived(home, away, windowSize) {
  const out = {};
  if (home.sample < 8 || away.sample < 8) return out;

  if (
    home.avg_goals_for - away.avg_goals_for >= 0.35 &&
    home.clean_sheets_pct >= away.clean_sheets_pct + 10 &&
    windowSize >= 8
  ) {
    out.strong_home = {
      status: true,
      basedOn: ["goals", "clean_sheets"],
      window: windowSize
    };
  }

  return out;
}

// ================================
// TEST PAYLOAD BUILDER
// ================================
function buildTestPayload() {
  const mk = (gf, ga, sot, sota, xgf, xga) => ({
    goals_for: gf,
    goals_against: ga,
    shots_on_target: sot,
    shots_on_target_against: sota,
    xg_for: xgf,
    xg_against: xga
  });

  return {
    matchId: 999999,
    league: "test.league",
    season: "2025",
    scope: { window: 10, type: "league" },
    home: {
      matches: [
        mk(2,1,5,3,1.6,0.9), mk(1,0,4,2,1.2,0.6),
        mk(3,1,6,4,2.1,1.0), mk(2,0,5,3,1.8,0.7),
        mk(1,1,4,3,1.0,1.0), mk(2,1,5,4,1.7,1.2),
        mk(3,0,6,2,2.3,0.5), mk(2,1,5,3,1.9,0.8),
        mk(1,0,4,2,1.1,0.6), mk(2,1,5,3,1.6,0.9)
      ]
    },
    away: {
      matches: [
        mk(0,2,2,6,0.5,1.8), mk(1,1,3,4,0.9,1.0),
        mk(1,2,3,5,1.0,1.7), mk(0,1,2,4,0.6,1.2),
        mk(1,2,3,5,0.8,1.6), mk(0,3,1,6,0.4,2.1),
        mk(1,1,3,4,1.0,1.0), mk(0,2,2,5,0.6,1.8),
        mk(1,1,3,4,0.9,1.0), mk(0,2,2,6,0.5,1.9)
      ]
    }
  };
}

// ================================
function round(x) {
  return Math.round(x * 100) / 100;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}
