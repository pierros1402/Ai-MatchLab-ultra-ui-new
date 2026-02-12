
// ============================================================
// AIMATCHLAB — VALUE ENGINE (PRODUCTION STRICT v5.0)
// ============================================================

export async function handleValue(req, env) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/run")) {
    return runValueEngine(env, url);
  }

  if (pathname.endsWith("/eval")) {
    return json({ ok:true, eval:true });
  }

  return json({ ok:false, error:"invalid_value_route" }, 404);
}

async function runValueEngine(env, url){

  const date = url.searchParams.get("date") || isoToday();
  const force = url.searchParams.get("force") === "1";

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey = `VALUE:STAT:DATE:${date}`;

  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) {
      return json({ ok:true, skipped:"already_generated", date });
    }
  }

  let fixturesRaw =
    await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`) ||
    await env.AIML_INGESTION_KV.get(`FIXTURES:STAGING:DATE:${date}`);

  if (!fixturesRaw) return json({ ok:false, reason:"no_fixtures" });

  const fixtures = JSON.parse(fixturesRaw);
  const matches = Array.isArray(fixtures.matches) ? fixtures.matches : [];

  const indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
  if (!indexRaw) return json({ ok:false, reason:"missing_team_stats_index" });

  const latest = JSON.parse(indexRaw).latest;

  const statsRaw = await env.AIMATCHLAB_STATS.get(`TEAM_STATS:SEASON:${latest}`);
  if (!statsRaw) return json({ ok:false, reason:"missing_team_stats_season" });

  const leagues = JSON.parse(statsRaw).leagues || {};

  const items = [];

  for (const m of matches){

    if (!m) continue;
    const st = String(m.status || "").toUpperCase();
    if (!(st === "PRE" || st === "STATUS_SCHEDULED")) continue;

    const found = findStats(leagues, m.home, m.away);
    if (!found) continue;

    const markets = buildMarkets(found.home, found.away);
    const clean = resolveConflicts(markets);

    for (const p of clean){
      items.push({
        matchId: String(m.id),
        leagueSlug: m.leagueSlug || "",
        leagueName: m.leagueName || "",
        kickoff: m.kickoff || "",
        home: m.home,
        away: m.away,
        market: p.market,
        pick: p.pick,
        confidence: p.confidence,
        score: Math.round(p.prob * 100)
      });
    }
  }

  const payload = {
    date,
    createdAt: Date.now(),
    season: latest,
    totalMatches: matches.length,
    producedItems: items.length,
    items
  };

  await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
  await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));

  return json({ ok:true, date, produced: items.length });
}

// ================= MARKETS =================

function buildMarkets(home, away){

  const gfH = safe(home.goals_for_avg);
  const gfA = safe(away.goals_for_avg);

  const xG = gfH + gfA;
  const volatility = Math.abs(gfH - gfA);

  const markets = [];

  // -------------------------
  // O/U 1.5
  // -------------------------
  const pOver15 = clamp(0.60 + (xG - 2.0) * 0.18);
  const pUnder15 = clamp(1 - pOver15 - 0.03); // πιο αυστηρό under

  pushOU(markets, "OVER_15", "OVER", pOver15, volatility);
  pushOU(markets, "OVER_15", "UNDER", pUnder15, volatility, true);

  // -------------------------
  // O/U 2.5
  // -------------------------
  const pOver25 = clamp(0.50 + (xG - 2.5) * 0.22);
  const pUnder25 = clamp(1 - pOver25 - 0.03); // πιο αυστηρό under

  pushOU(markets, "OVER_25", "OVER", pOver25, volatility);
  pushOU(markets, "OVER_25", "UNDER", pUnder25, volatility, true);

  // -------------------------
  // O/U 3.5
  // -------------------------
  const pOver35 = clamp(0.40 + (xG - 3.0) * 0.25);
  const pUnder35 = clamp(1 - pOver35 - 0.04); // ακόμη πιο αυστηρό under

  pushOU(markets, "OVER_35", "OVER", pOver35, volatility);
  pushOU(markets, "OVER_35", "UNDER", pUnder35, volatility, true);

  // -------------------------
  // BTTS
  // -------------------------
  const pBTTS = clamp(0.48 + (xG - 2.4) * 0.18);
  push(markets, "BTTS", pBTTS >= 0.5 ? "YES" : "NO", pBTTS);

  return markets;
}
function pushOU(list, market, pick, prob, volatility, isUnder=false){

  if (volatility > 1.2 && isUnder) return;
  if (edge(prob) < 0.12) return;

  const conf = tier(prob);
  if (!conf) return;

  list.push({ market, pick, prob, confidence: conf });
}

function push(list, market, pick, prob){
  if (edge(prob) < 0.12) return;
  const conf = tier(prob);
  if (!conf) return;
  list.push({ market, pick, prob, confidence: conf });
}

// ================= CONFLICTS =================

function resolveConflicts(markets){

  const grouped = {};

  for (const m of markets){
    if (!grouped[m.market]) grouped[m.market] = [];
    grouped[m.market].push(m);
  }

  const out = [];

  for (const k of Object.keys(grouped)){
    const arr = grouped[k];

    if (arr.length === 1){
      out.push(arr[0]);
      continue;
    }

    arr.sort((a,b)=>b.prob - a.prob);

    if (Math.abs(arr[0].prob - arr[1].prob) < 0.03){
      continue;
    }

    out.push(arr[0]);
  }

  return out;
}

// ================= TIERS =================

function tier(p){
  if (p >= 0.75) return "HIGH";
  if (p >= 0.67 && p <= 0.74) return "MEDIUM";
  if (p >= 0.65 && p <= 0.66) return "LOW";
  return null;
}

function edge(p){ return Math.abs(p - 0.5); }
function clamp(x){ return Math.max(0, Math.min(1, x)); }
function safe(n){ return typeof n === "number" && isFinite(n) ? n : 0; }

function findStats(leagues, home, away){
  for (const l of Object.keys(leagues || {})){
    const lg = leagues[l];
    if (lg?.[home] && lg?.[away]){
      return { home: lg[home], away: lg[away] };
    }
  }
  return null;
}

function isoToday(){ return new Date().toISOString().slice(0,10); }

function json(obj, status=200){
  return new Response(JSON.stringify(obj,null,2),{
    status,
    headers:{ "Content-Type":"application/json" }
  });
}
