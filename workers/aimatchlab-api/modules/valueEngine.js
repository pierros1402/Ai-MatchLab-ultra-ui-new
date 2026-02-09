// VALUE ENGINE MODULE - FULL MIGRATION
// Place inside: modules/valueEngine.js

// === FULL ORIGINAL ENGINE LOGIC RESTORED ===

export async function handleValue(req, env) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/run")) {
    return runValueEngine(env, url);
  }

  if (pathname.endsWith("/eval")) {
    return runEvaluation(env, url);
  }

  return json({ ok: false, error: "invalid_value_route" }, 404);
}

/* ================= RUN ================= */

async function runValueEngine(env, url) {

  const date = url.searchParams.get("date") || isoToday();
  const force = url.searchParams.get("force") === "1";

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey = `VALUE:STAT:DATE:${date}`;

  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) {
      return json({ ok: true, skipped: "already_generated", date });
    }
  }

  const fixturesRaw = await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`);
  if (!fixturesRaw) return json({ ok:false, reason:"no_fixtures", date });

  const fixtures = JSON.parse(fixturesRaw);
  const matches = Array.isArray(fixtures.matches) ? fixtures.matches : [];

  const indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
  if (!indexRaw) return json({ ok:false, reason:"missing_team_stats_index" });

  const latest = JSON.parse(indexRaw).latest;

  const statsRaw = await env.AIMATCHLAB_STATS.get(`TEAM_STATS:SEASON:${latest}`);
  if (!statsRaw) return json({ ok:false, reason:"missing_team_stats_season" });

  const leagues = JSON.parse(statsRaw).leagues || {};
  const summaryItems = [];

  for (const m of matches) {
    if (!m) continue;
    const st = String(m.status || "").toUpperCase();
    if (!(st === "PRE" || st === "STATUS_SCHEDULED")) continue;

    const found = findStatsForTeams(leagues, m.home, m.away);
    if (!found) continue;

    const markets = buildMarkets(found.homeStats, found.awayStats);
    const flat = flattenMarkets(markets);

    for (const it of flat) {
      if (!it.confidence) continue;

      summaryItems.push({
        matchId: String(m.id || ""),
        leagueSlug: m.leagueSlug || "",
        leagueName: m.leagueName || "",
        kickoff: m.kickoff || "",
        home: m.home || "",
        away: m.away || "",
        market: it.market,
        pick: it.prediction,
        confidence: it.confidence,
        score: confidenceScorePercent(it.confidence)
      });
    }
  }

  const payload = {
    date,
    createdAt: Date.now(),
    season: latest,
    totalMatches: matches.length,
    producedItems: summaryItems.length,
    items: summaryItems
  };

  await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
  await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));

  return json({ ok:true, date, produced: summaryItems.length });
}

/* ================= EVAL (kept identical placeholder) ================= */

async function runEvaluation(env, url) {
  const date = url.searchParams.get("date") || isoYesterday();
  return json({ ok:true, date, eval:true });
}

/* ================= ORIGINAL HELPERS ================= */

function buildMarkets(home, away) {
  if (!home || !away) return {};

  const markets = {};

  const gfH = safeNum(home.goals_for_avg);
  const gfA = safeNum(away.goals_for_avg);
  const xG = gfH + gfA;

  const pOver25 = clamp01(0.50 + (xG - 2.5) * 0.20);

  markets.over25 = {
    market: "OVER_25",
    prediction: "OVER",
    prob: pOver25,
    confidence: pOver25 >= 0.65 ? "HIGH" : pOver25 >= 0.56 ? "MEDIUM" : null
  };

  return markets;
}

function flattenMarkets(marketsObj) {
  const out = [];
  for (const k in marketsObj) {
    const v = marketsObj[k];
    if (!v || !v.confidence) continue;
    out.push({
      market: v.market,
      prediction: v.prediction,
      probability: v.prob,
      confidence: v.confidence
    });
  }
  return out;
}

function findStatsForTeams(leagues, home, away) {
  for (const leagueCode of Object.keys(leagues || {})) {
    const league = leagues[leagueCode];
    if (league?.[home] && league?.[away]) {
      return { homeStats: league[home], awayStats: league[away] };
    }
  }
  return null;
}

function confidenceScorePercent(c) {
  if (c === "HIGH") return 75;
  if (c === "MEDIUM") return 62;
  return 52;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function safeNum(n){ return typeof n==="number" && isFinite(n) ? n : 0; }
function isoToday(){ return new Date().toISOString().slice(0,10); }
function isoYesterday(){ const d=new Date(); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }

function json(obj, status=200){
  return new Response(JSON.stringify(obj,null,2),{
    status,
    headers:{ "Content-Type":"application/json" }
  });
}
