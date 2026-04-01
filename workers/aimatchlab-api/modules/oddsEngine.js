/**
 * AIMATCHLAB – ODDS ENGINE (API MODULE, UNIFIED)
 * FREE 4 LEAGUES – UI COMPATIBLE SNAPSHOT
 *
 * WRITE:
 *   GET /api/odds/internal/run?date=YYYY-MM-DD&days=2
 *
 * READ (OIC compatible):
 *   GET /api/odds?matchId=737014&date=YYYY-MM-DD&market=1X2
 *
 * Reads:
 *   FIXTURES:DATE:<YYYY-MM-DD>  (AIML_INGESTION_KV)
 *
 * Writes:
 *   odds/core/<YYYY-MM-DD>.json (R2_ODDS bucket)
 */

const VERSION = "odds-engine_api_v3.0.0";
const TZ = "Europe/Athens";

const ALLOWED_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1"];
const MARKET_KEY = "1X2";
const ODDS_API_MARKET = "h2h";

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

/* ============================================================
   MAIN ENTRY
============================================================ */

export async function handleOdds(req, env) {
  const url = new URL(req.url);

  // WRITE SNAPSHOT
  if (url.pathname.includes("/internal/run")) {
    return runWriter(url, env);
  }

  // READ FOR OIC
  return runReader(url, env);
}

/* ============================================================
   READER (R2 VERSION – NO KV READS)
============================================================ */

async function runReader(url, env) {

  const date = url.searchParams.get("date") || dayKeyGR();
  const matchId = String(url.searchParams.get("matchId") || "").trim();
  const market = url.searchParams.get("market") || "1X2";

  if (!matchId)
    return json({ ok: false, reason: "missing_matchId" }, 400);

  if (!env?.R2_ODDS)
    return json({ ok:false, reason:"missing_R2_ODDS_binding" }, 500);

  const snapKey = `odds/core/${date}.json`;

  let snap = null;

  try {
    const obj = await env.R2_ODDS.get(snapKey);
    if (obj) snap = await obj.json();
  } catch (e) {
    console.log("R2 SNAP READ FAIL:", snapKey);
    snap = null;
  }

  if (!snap?.matchIndex?.[matchId]) {
    return json({
      ok: true,
      market,
      snapshot: null
    });
  }

  const block =
    snap.matchIndex[matchId]?.markets?.[market] || null;

  return json({
    ok: true,
    market,
    snapshot: block
  });
}
/* ============================================================
   WRITER (R2 VERSION – NO KV WRITES)
============================================================ */

async function runWriter(url, env) {
  const date = url.searchParams.get("date") || dayKeyGR();
  const days = clampInt(url.searchParams.get("days"), 2, 0, 7);

  if (!env?.R2_ODDS) {
    return json({ ok: false, reason: "missing_R2_ODDS_binding" });
  }

  const apiKey =
    typeof env.ODDS_API_KEY === "string"
      ? env.ODDS_API_KEY.trim()
      : "";

  if (!apiKey) {
    console.log("ODDS_API_KEY missing or invalid type");
    return json({ ok: false, reason: "missing_ODDS_API_KEY" });
  }

  const region =
    typeof env.ODDS_REGION === "string"
      ? env.ODDS_REGION
      : "eu";

  const results = [];
  let totalWritten = 0;

  for (let i = 0; i <= days; i++) {
    const d = addDays(date, i);

    try {
      const r = await processOneDateR2(env, apiKey, region, d);
      results.push(r);
      totalWritten += r.matchesWritten || 0;
    } catch (err) {
      console.log("PROCESS ERROR:", d, err);
      results.push({
        ok: false,
        date: d,
        error: "process_failed"
      });
    }
  }

  return json({
    ok: true,
    version: VERSION,
    baseDate: date,
    days,
    totalWritten,
    results
  });
}

/* ============================================================
   PROCESS ONE DATE (R2 SNAPSHOT)
============================================================ */

async function processOneDateR2(env, apiKey, region, date) {

  // ------------------------------------------------------------
  // LOAD FIXTURES (FROM ENGINE-V1 BACKBONE)
  // ------------------------------------------------------------

async function fetchFixturesFromEngine(env, date) {
  const base = String(env.ENGINE_V1_BASE || "").trim();

  if (!base) {
    throw new Error("missing_ENGINE_V1_BASE");
  }

  const res = await fetch(`${base}/fixtures-runtime?mode=active&date=${date}`);

  if (!res.ok) {
    throw new Error(`engine_fetch_failed_${res.status}`);
  }

  const data = await res.json();

  return data?.matches || [];
}

  const matches = await fetchFixturesFromEngine(env, date);
  const eligible = matches.filter(m =>
    ALLOWED_LEAGUES.includes(m?.leagueSlug)
  );

  // ------------------------------------------------------------
  // PREVIOUS SNAPSHOT FROM R2
  // ------------------------------------------------------------

  const snapKey = `odds/core/${date}.json`;

  let prevSnap = null;

  try {
    const obj = await env.R2_ODDS.get(snapKey);
    if (obj) prevSnap = await obj.json();
  } catch (e) {
    console.log("R2 SNAP READ FAIL:", snapKey);
    prevSnap = null;
  }

  // ------------------------------------------------------------
  // FETCH ODDS PER LEAGUE
  // ------------------------------------------------------------

  const oddsByLeague = {};

  for (const lg of [...new Set(eligible.map(x => x.leagueSlug))]) {
    const sportKey = SPORT_KEY_BY_LEAGUE[lg];
    if (!sportKey) continue;
    oddsByLeague[lg] = await fetchOddsForSport(apiKey, region, sportKey);
  }

  // ------------------------------------------------------------
  // BUILD MATCH INDEX
  // ------------------------------------------------------------

  const matchIndex = {};

  for (const m of eligible) {

    const matchId = String(m.id || "");
    const payload = oddsByLeague[m.leagueSlug];
    const ev = findMatch(payload, m);

    const providers = ev ? extractProviders(ev) : [];

    const prevBlock =
      prevSnap?.matchIndex?.[matchId]?.markets?.[MARKET_KEY] || null;

    const merged = mergeBlock(prevBlock, providers);

    matchIndex[matchId] = {
      matchId,
      date,
      home: m.home,
      away: m.away,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName,
      kickoff_ms: m.kickoff_ms ?? null,
      markets: {
        [MARKET_KEY]: merged
      }
    };
  }

  const newPayload = {
    ok: true,
    date,
    createdAtMs: Date.now(),
    market: MARKET_KEY,
    matchIndex
  };

  // ------------------------------------------------------------
  // CHANGE DETECTION (NO USELESS WRITES)
  // ------------------------------------------------------------

  if (
    prevSnap &&
    JSON.stringify(prevSnap.matchIndex) === JSON.stringify(matchIndex)
  ) {
    return {
      ok: true,
      date,
      skipped: "no_changes",
      matchesWritten: 0,
      writtenKey: snapKey
    };
  }

  // ------------------------------------------------------------
  // WRITE TO R2
  // ------------------------------------------------------------

  await env.R2_ODDS.put(
    snapKey,
    JSON.stringify(newPayload),
    {
      httpMetadata: {
        contentType: "application/json"
      }
    }
  );

  return {
    ok: true,
    date,
    fixturesEligible: eligible.length,
    matchesWritten: Object.keys(matchIndex).length,
    writtenKey: snapKey
  };
}
/* ============================================================
   ODDS API
============================================================ */

async function fetchOddsForSport(apiKey, region, sportKey) {
  const url =
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/` +
    `?regions=${region}&markets=${ODDS_API_MARKET}` +
    `&oddsFormat=decimal&dateFormat=iso&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function findMatch(payload, fixture) {
  if (!Array.isArray(payload)) return null;

  const home = norm(fixture.home);
  const away = norm(fixture.away);

  return payload.find(ev =>
    norm(ev.home_team) === home &&
    norm(ev.away_team) === away
  ) || null;
}

function extractProviders(ev) {
  const out = [];

  for (const bm of ev.bookmakers || []) {
    const m = (bm.markets || []).find(x => x.key === ODDS_API_MARKET);
    if (!m) continue;

    const outcomes = m.outcomes || [];

    const home = outcomes.find(o => o.name === ev.home_team)?.price ?? null;
    const away = outcomes.find(o => o.name === ev.away_team)?.price ?? null;
    const draw = outcomes.find(o =>
      o.name.toLowerCase() === "draw"
    )?.price ?? null;

    out.push({
      book: bm.title,
      legs: [home, draw, away]
    });
  }

  return out;
}

function mergeBlock(prev, providers) {
  const out = {};
  const old = prev || {};

  for (const p of providers) {
    const prevLegs = old[p.book] || [];
    const merged = [];

    for (let i = 0; i < 3; i++) {
      const cur = num(p.legs[i]);
      const open = prevLegs[i]?.open ?? cur;
      const delta = open != null && cur != null ? cur - open : null;
      merged.push({ open, current: cur, delta });
    }

    out[p.book] = merged;
  }

  return out;
}

/* ============================================================
   UTILS
============================================================ */

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\.\-'"`]/g, "")
    .trim();
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
