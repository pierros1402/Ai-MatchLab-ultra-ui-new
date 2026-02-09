/**
 * AIMATCHLAB – ODDS ENGINE (API MODULE, UNIFIED) v4
 * Multi-market (1X2, DNB, OU25, BTTS)
 * Single request per league
 */

const VERSION = "odds-engine_api_v4.0.0";
const TZ = "Europe/Athens";

const ALLOWED_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1"];

const ODDS_API_MARKETS = ["h2h", "draw_no_bet", "totals", "btts"];

const SPORT_KEY_BY_LEAGUE = {
  "eng.1": "soccer_epl",
  "esp.1": "soccer_spain_la_liga",
  "ita.1": "soccer_italy_serie_a",
  "ger.1": "soccer_germany_bundesliga"
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export async function handleOdds(req, env) {
  const url = new URL(req.url);

  if (url.pathname.includes("/internal/run")) {
    return runWriter(url, env);
  }

  return runReader(url, env);
}

async function runReader(url, env) {
  const date = url.searchParams.get("date") || dayKeyGR();
  const matchId = String(url.searchParams.get("matchId") || "").trim();
  const market = url.searchParams.get("market") || "1X2";

  if (!matchId)
    return json({ ok: false, reason: "missing_matchId" }, 400);

  const snapKey = `ODDS:CORE:DATE:${date}`;
  const snap = await env.AIML_INGESTION_KV.get(snapKey, { type: "json" });

  if (!snap?.matchIndex?.[matchId])
    return json({ ok: true, market, snapshot: null });

  const block = snap.matchIndex[matchId]?.markets?.[market] || null;

  return json({
    ok: true,
    market,
    snapshot: block
  });
}

async function runWriter(url, env) {
  const date = url.searchParams.get("date") || dayKeyGR();
  const days = clampInt(url.searchParams.get("days"), 2, 0, 7);

  if (!env?.AIML_INGESTION_KV)
    return json({ ok: false, reason: "missing_AIML_INGESTION_KV" });

  const apiKey = (env.ODDS_API_KEY || "").trim();
  if (!apiKey)
    return json({ ok: false, reason: "missing_ODDS_API_KEY" });

  const region = String(env.ODDS_REGION || "eu");

  const results = [];
  let totalWritten = 0;

  for (let i = 0; i <= days; i++) {
    const d = addDays(date, i);
    const r = await processOneDate(env, apiKey, region, d);
    results.push(r);
    totalWritten += r.matchesWritten || 0;
  }

  return json({
    ok: true,
    version: VERSION,
    dateFrom: date,
    days,
    totalWrittenMatches: totalWritten,
    perDate: results
  });
}

async function processOneDate(env, apiKey, region, date) {
  const fxKey = `FIXTURES:DATE:${date}`;
  const fx = await env.AIML_INGESTION_KV.get(fxKey, { type: "json" });

  const matches = Array.isArray(fx?.matches) ? fx.matches : [];
  const eligible = matches.filter(m =>
    ALLOWED_LEAGUES.includes(m?.leagueSlug)
  );

  const snapKey = `ODDS:CORE:DATE:${date}`;
  const prevSnap = await env.AIML_INGESTION_KV.get(snapKey, { type: "json" });

  const oddsByLeague = {};

  for (const lg of [...new Set(eligible.map(x => x.leagueSlug))]) {
    const sportKey = SPORT_KEY_BY_LEAGUE[lg];
    if (!sportKey) continue;
    oddsByLeague[lg] = await fetchOddsForSport(apiKey, region, sportKey);
  }

  const matchIndex = {};

  for (const m of eligible) {
    const matchId = String(m.id || "");
    const payload = oddsByLeague[m.leagueSlug];
    const ev = findMatch(payload, m);

    const markets = buildMarkets(ev, prevSnap?.matchIndex?.[matchId]?.markets);

    matchIndex[matchId] = {
      matchId,
      date,
      home: m.home,
      away: m.away,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName,
      kickoff_ms: m.kickoff_ms ?? null,
      markets
    };
  }

  await env.AIML_INGESTION_KV.put(
    snapKey,
    JSON.stringify({
      ok: true,
      date,
      createdAtMs: Date.now(),
      matchIndex
    })
  );

  return {
    ok: true,
    date,
    fixturesEligible: eligible.length,
    matchesWritten: Object.keys(matchIndex).length,
    writtenKey: snapKey
  };
}

async function fetchOddsForSport(apiKey, region, sportKey) {
  const url =
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
    `?regions=${region}&markets=${ODDS_API_MARKETS.join(",")}` +
    `&oddsFormat=decimal&dateFormat=iso&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildMarkets(ev, prevMarkets = {}) {
  if (!ev) return {};

  const markets = {
    "1X2": {},
    "DNB": {},
    "OU25": {},
    "BTTS": {}
  };

  for (const bm of ev.bookmakers || []) {
    for (const market of bm.markets || []) {

      if (market.key === "h2h") {
        const home = findOutcome(market, ev.home_team);
        const draw = findOutcome(market, "Draw");
        const away = findOutcome(market, ev.away_team);
        markets["1X2"][bm.title] =
          mergeLegs(prevMarkets?.["1X2"]?.[bm.title], [home, draw, away]);
      }

      if (market.key === "draw_no_bet") {
        const home = findOutcome(market, ev.home_team);
        const away = findOutcome(market, ev.away_team);
        markets["DNB"][bm.title] =
          mergeLegs(prevMarkets?.["DNB"]?.[bm.title], [home, away]);
      }

      if (market.key === "totals") {
        const over = market.outcomes.find(o => o.name === "Over" && o.point == 2.5)?.price ?? null;
        const under = market.outcomes.find(o => o.name === "Under" && o.point == 2.5)?.price ?? null;
        markets["OU25"][bm.title] =
          mergeLegs(prevMarkets?.["OU25"]?.[bm.title], [over, under]);
      }

      if (market.key === "btts") {
        const yes = findOutcome(market, "Yes");
        const no = findOutcome(market, "No");
        markets["BTTS"][bm.title] =
          mergeLegs(prevMarkets?.["BTTS"]?.[bm.title], [yes, no]);
      }
    }
  }

  return markets;
}

function findOutcome(market, name) {
  return market.outcomes.find(o =>
    o.name.toLowerCase() === name.toLowerCase()
  )?.price ?? null;
}

function mergeLegs(prev, legs) {
  const out = [];
  const old = prev || [];

  for (let i = 0; i < legs.length; i++) {
    const cur = num(legs[i]);
    const open = old[i]?.open ?? cur;
    const delta = open != null && cur != null ? cur - open : null;
    out.push({ open, current: cur, delta });
  }

  return out;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function dayKeyGR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function clampInt(v, def, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return Math.floor(n);
}
