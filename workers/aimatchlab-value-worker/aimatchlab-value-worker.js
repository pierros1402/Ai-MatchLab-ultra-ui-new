export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/internal/run") {
      return runValueEngine(env);
    }
    return new Response("Not Found", { status: 404 });
  }
};

async function runValueEngine(env) {
  const date = new Date().toISOString().slice(0, 10);

  const fixturesRaw = await env.AIMATCHLAB_KV_CORE.get(
    `FIXTURES:DATE:${date}`
  );
  if (!fixturesRaw) {
    return json({ ok: false, reason: "no_fixtures", date });
  }

  const fixtures = JSON.parse(fixturesRaw);
  const matches = Array.isArray(fixtures.matches)
    ? fixtures.matches
    : [];

  let indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
  if (!indexRaw) {
    indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX\n");
  }
  if (!indexRaw) {
    return json({ ok: false, reason: "missing_team_stats_index" });
  }

  const { latest } = JSON.parse(indexRaw);
  const statsRaw = await env.AIMATCHLAB_STATS.get(
    `TEAM_STATS:SEASON:${latest}`
  );
  if (!statsRaw) {
    return json({ ok: false, reason: "missing_team_stats_season" });
  }

  const leagues = JSON.parse(statsRaw).leagues || {};

  const results = [];
  let skippedCups = 0;
  let skippedNoStats = 0;

  for (const m of matches) {
    if (m.status !== "PRE") continue;
    if (isDomesticCup(m.leagueSlug)) {
      skippedCups++;
      continue;
    }

    const found = findStats(leagues, m.home, m.away);
    if (!found) {
      skippedNoStats++;
      continue;
    }

    const markets = buildMarkets(found.home, found.away);
    if (!markets) continue;

    results.push({
      matchId: m.id,
      league: found.league,
      leagueSlug: m.leagueSlug,
      kickoff: m.kickoff,
      home: m.home,
      away: m.away,
      markets
    });
  }

  await env.AIMATCHLAB_KV_CORE.put(
    `VALUE:STAT:DATE:${date}`,
    JSON.stringify(
      {
        date,
        season: latest,
        produced: results.length,
        skippedCups,
        skippedNoStats,
        results
      },
      null,
      2
    )
  );

  return json({
    ok: true,
    date,
    season: latest,
    produced: results.length
  });
}

/* ================= MARKET LOGIC ================= */

function buildMarkets(home, away) {
  if (home.matches_used < 5 || away.matches_used < 5) return null;

  const markets = {};

  const xG = home.goals_for_avg + away.goals_for_avg;

  /* OVER */
  if (xG >= 2.0) markets.over15 = conf(xG >= 2.3);
  if (xG >= 2.6) markets.over25 = conf(xG >= 3.0);
  if (xG >= 3.4) markets.over35 = conf(xG >= 3.8);

  /* UNDER */
  if (xG <= 1.4) markets.under15 = conf(xG <= 1.2);
  if (xG <= 2.4) markets.under35 = conf(xG <= 2.1);

  /* BTTS */
  const btts =
    (home.btts_rate + away.btts_rate) / 2;
  if (btts >= 0.58) {
    markets.btts = {
      prob: round(btts),
      confidence: btts >= 0.64 ? "HIGH" : "MEDIUM"
    };
  }

  /* DC */
  const delta =
    home.goals_for_avg - away.goals_for_avg;

  if (delta >= 0.30) markets.dc = { pick: "1X", confidence: "HIGH" };
  else if (delta <= -0.30) markets.dc = { pick: "X2", confidence: "HIGH" };
  else if (xG >= 3.0) markets.dc = { pick: "12", confidence: "MEDIUM" };

  /* 1X2 – NO DRAW */
  if (delta >= 0.55) markets["1x2"] = { pick: "1", confidence: "HIGH" };
  else if (delta <= -0.55) markets["1x2"] = { pick: "2", confidence: "HIGH" };

  return Object.keys(markets).length ? markets : null;
}

/* ================= HELPERS ================= */

function isDomesticCup(slug) {
  const s = slug?.toLowerCase() || "";
  if (s.startsWith("uefa.") || s.startsWith("caf.") || s.startsWith("afc."))
    return false;
  return (
    s.includes("cup") ||
    s.includes("copa") ||
    s.includes("coppa") ||
    s.includes("trophy")
  );
}

function findStats(leagues, h, a) {
  for (const l of Object.keys(leagues)) {
    const lg = leagues[l];
    if (lg?.[h] && lg?.[a]) {
      return { league: l, home: lg[h], away: lg[a] };
    }
  }
  return null;
}

function conf(high) {
  return { confidence: high ? "HIGH" : "MEDIUM" };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function json(o) {
  return new Response(JSON.stringify(o, null, 2), {
    headers: { "content-type": "application/json" }
  });
}
