/**
 * AIMATCHLAB — ODDS WORKER (FREE 4 LEAGUES) ✅ FINAL (UI COMPAT)
 *
 * Goals:
 * - Fetch real odds (The Odds API) for 4 leagues (EPL/LaLiga/SerieA/Bundesliga)
 * - Store OPENING (first seen) + CURRENT (latest) for UI
 * - Write per-day snapshot so UI day switch works (today / tomorrow / +2)
 * - UI schema compatibility with oic-renderer.js:
 *     snapshot.markets[marketKey][BookName] = [{open,current,delta}, ...]
 *
 * Markets (free plan): ONLY 1X2 (h2h) for now
 *
 * Reads:
 * - AIMATCHLAB_KV_CORE: FIXTURES:DATE:<YYYY-MM-DD>
 *
 * Writes:
 * - AIMATCHLAB_KV_CORE: ODDS:CORE:DATE:<YYYY-MM-DD>
 *   (contains snapshot with markets.1X2)
 *
 * No cron triggers here (scheduler will call /internal/run)
 */

const VERSION = "odds-worker_free4_ui_final_v1.0.0";
const TZ = "Europe/Athens";

// 4 leagues scope
const ALLOWED_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1"];

// Only market for free plan UI snapshot
const MARKET_KEY = "1X2";        // UI dropdown key
const ODDS_API_MARKET = "h2h";   // The Odds API market key

// Map ESPN leagueSlug -> The Odds API sport key
const SPORT_KEY_BY_LEAGUE = {
  "eng.1": "soccer_epl",
  "esp.1": "soccer_spain_la_liga",
  "ita.1": "soccer_italy_serie_a",
  "ger.1": "soccer_germany_bundesliga"
};

// ---------- Worker ----------
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "") {
        return json({
          ok: true,
          service: "aimatchlab-odds-worker",
          version: VERSION,
          market: MARKET_KEY,
          leagues: ALLOWED_LEAGUES,
          now: new Date().toISOString(),
          hint: "Use /internal/run (optional ?date=YYYY-MM-DD&days=2&force=1)"
        });
      }

      if (url.pathname === "/internal/run") {
        const date = url.searchParams.get("date") || dayKeyGR();
        const force = url.searchParams.get("force") === "1";
        const days = clampInt(url.searchParams.get("days"), 2, 0, 7); // today + N days (default 2 => today,tomorrow,+2)

        const result = await runOdds(env, { date, force, days });
        return json(result);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      return json({ ok: false, reason: "fetch_exception", error: String(e) }, 500);
    }
  }
};

// ---------- Core ----------
async function runOdds(env, opts = {}) {
  const startedAt = Date.now();
  const date0 = String(opts.date || dayKeyGR());
  const force = !!opts.force;
  const days = Number.isFinite(opts.days) ? opts.days : 2;

  // bindings checks
  if (!env?.AIMATCHLAB_KV_CORE) {
    return { ok: false, reason: "missing_binding_AIMATCHLAB_KV_CORE", version: VERSION };
  }

  const apiKey = (env.ODDS_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, reason: "missing_ODDS_API_KEY", version: VERSION, note: "Set ODDS_API_KEY secret" };
  }

  const region = String(env.ODDS_REGION || "eu").trim() || "eu";

  const results = [];
  let totalEligible = 0;
  let totalWrittenMatches = 0;

  for (let di = 0; di <= days; di++) {
    const date = addDays(date0, di);
    const r = await processOneDate(env, { apiKey, region, date, force });
    results.push(r);
    totalEligible += (r.fixturesEligible || 0);
    totalWrittenMatches += (r.matchesWritten || 0);
  }

  return {
    ok: true,
    version: VERSION,
    market: MARKET_KEY,
    oddsMarket: ODDS_API_MARKET,
    region,
    dateFrom: date0,
    days,
    totalEligible,
    totalWrittenMatches,
    perDate: results,
    durationMs: Date.now() - startedAt
  };
}

async function processOneDate(env, ctx) {
  const { apiKey, region, date } = ctx;

  // read fixtures
  const fxKey = `FIXTURES:DATE:${date}`;
  const fx = await env.AIMATCHLAB_KV_CORE.get(fxKey, { type: "json" });

  const matches = Array.isArray(fx?.matches) ? fx.matches : [];
  const eligible = matches.filter(m => ALLOWED_LEAGUES.includes(m?.leagueSlug));
  const eligibleByLeague = groupBy(eligible, m => m.leagueSlug);

  // load previous snapshot (for opening freeze)
  const snapKey = `ODDS:CORE:DATE:${date}`;
  const prevSnap = await env.AIMATCHLAB_KV_CORE.get(snapKey, { type: "json" });
  const prevMarkets = prevSnap && prevSnap.markets ? prevSnap.markets : {};

  // prepare new snapshot container
  const outSnap = {
    ok: true,
    date,
    createdAtMs: Date.now(),
    market: MARKET_KEY,
    source: "odds_api_free4",
    markets: {
      [MARKET_KEY]: {} // Book -> legs array
    },
    meta: {
      fixturesKey: fxKey,
      fixturesTotal: matches.length,
      fixturesEligible: eligible.length,
      region
    }
  };

  // fetch odds per league sport key (1 request per league)
  const oddsByLeague = {};
  for (const leagueSlug of Object.keys(eligibleByLeague)) {
    const sportKey = SPORT_KEY_BY_LEAGUE[leagueSlug];
    if (!sportKey) continue;

    const payload = await fetchOddsForSport(apiKey, region, sportKey);
    oddsByLeague[leagueSlug] = payload;
  }

  // build per-match snapshot blocks for UI (matchId -> snapshot)
  // UI expects snapshot per matchId, so we'll store a "matchIndex" for scheduler to emit snapshots by match.
  // Also write an aggregated per-date snapshot for debugging.
  const matchIndex = {};

  for (const m of eligible) {
    const matchId = String(m?.id || "").trim();
    if (!matchId) continue;

    const leagueSlug = m.leagueSlug;
    const oddsPayload = oddsByLeague[leagueSlug];

    // attempt map to odds event
    const ev = findBestOddsEventForFixture(oddsPayload, m);
    const providers = ev ? extract1X2Providers(ev) : [];

    // merge opening/current per book based on prev match snapshot (if exists)
    const prevMatchSnap = prevSnap && prevSnap.matchIndex ? prevSnap.matchIndex[String(matchId)] : null;
    const prevMarketBlock = prevMatchSnap && prevMatchSnap.markets ? prevMatchSnap.markets[MARKET_KEY] : null;

    const mergedMarketBlock = mergeOpeningCurrentMarketBlock(prevMarketBlock, providers);

    const matchSnap = {
      matchId,
      date,
      market: MARKET_KEY,
      createdAtMs: Date.now(),
      kickoff_ms: m.kickoff_ms ?? null,
      home: m.home || "",
      away: m.away || "",
      leagueSlug: m.leagueSlug || "",
      leagueName: m.leagueName || "",
      markets: {
        [MARKET_KEY]: mergedMarketBlock
      }
    };

    matchIndex[String(matchId)] = matchSnap;
  }

  outSnap.matchIndex = matchIndex;

  // write snapshot
  await env.AIMATCHLAB_KV_CORE.put(snapKey, JSON.stringify(outSnap));

  return {
    ok: true,
    date,
    writtenKey: snapKey,
    fixturesKey: fxKey,
    fixturesTotal: matches.length,
    fixturesEligible: eligible.length,
    leaguesEligible: Object.keys(eligibleByLeague).length,
    matchesWritten: Object.keys(matchIndex).length,
    note: "ODDS snapshot written (UI-compatible)."
  };
}

// ---------- Odds API ----------
async function fetchOddsForSport(apiKey, region, sportKey) {
  const base = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds/`;
  const url =
    `${base}?regions=${encodeURIComponent(region)}` +
    `&markets=${encodeURIComponent(ODDS_API_MARKET)}` +
    `&oddsFormat=decimal&dateFormat=iso` +
    `&apiKey=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    const txt = await res.text();

    if (!res.ok) {
      return { ok: false, status: res.status, body: txt.slice(0, 500), sportKey };
    }

    const data = safeJson(txt, []);
    return { ok: true, sportKey, data: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, sportKey, error: String(e) };
  }
}

// ---------- Mapping / Extraction ----------
function findBestOddsEventForFixture(oddsPayload, fixture) {
  if (!oddsPayload || !oddsPayload.ok) return null;
  const arr = Array.isArray(oddsPayload.data) ? oddsPayload.data : [];
  if (!arr.length) return null;

  const fxHome = normTeam(fixture.home);
  const fxAway = normTeam(fixture.away);
  const fxKO = Number(fixture.kickoff_ms || 0);

  // Best-effort matching: home+away names must match; kickoff optional tolerance
  let best = null;
  let bestScore = -1;

  for (const ev of arr) {
    const home = normTeam(ev.home_team);
    const away = normTeam(ev.away_team);

    if (!home || !away) continue;

    let score = 0;

    if (home === fxHome) score += 5;
    if (away === fxAway) score += 5;

    // tolerate swapped teams if API flips ordering
    if (!score && home === fxAway && away === fxHome) score += 8;

    if (fxKO && ev.commence_time) {
      const evMs = Date.parse(ev.commence_time);
      if (Number.isFinite(evMs)) {
        const diffMin = Math.abs(evMs - fxKO) / 60000;
        if (diffMin <= 30) score += 2;
        else if (diffMin <= 180) score += 1;
      }
    }

    if (score > bestScore) {
      best = ev;
      bestScore = score;
    }
  }

  return bestScore >= 8 ? best : null;
}

// Providers normalized to UI "books"
function extract1X2Providers(ev) {
  const out = [];
  const bms = Array.isArray(ev.bookmakers) ? ev.bookmakers : [];

  for (const bm of bms) {
    const book = normalizeBookName(bm.title || bm.key || "Book");
    const mkts = Array.isArray(bm.markets) ? bm.markets : [];
    const m = mkts.find(x => x && x.key === ODDS_API_MARKET);
    if (!m) continue;

    const outcomes = Array.isArray(m.outcomes) ? m.outcomes : [];
    if (outcomes.length < 2) continue;

    // We need 3 legs: 1/X/2. Many providers return 2-way for some events; handle best-effort.
    const legs = build1X2Legs(ev, outcomes);

    out.push({ book, legs });
  }

  return out;
}

function build1X2Legs(ev, outcomes) {
  // outcomes: list of {name, price}
  // We map:
  //  - "1": home win
  //  - "2": away win
  //  - "X": draw (if provided) else null
  const homeName = String(ev.home_team || "").trim();
  const awayName = String(ev.away_team || "").trim();

  let home = null, away = null, draw = null;

  for (const o of outcomes) {
    if (!o) continue;
    const nm = String(o.name || "").trim();
    const pr = Number(o.price);

    if (!home && nm === homeName) home = pr;
    else if (!away && nm === awayName) away = pr;
    else if (!draw && (nm.toLowerCase() === "draw" || nm === "X")) draw = pr;
  }

  // fallback: first two as home/away
  if (home == null && outcomes[0]) home = Number(outcomes[0].price) || null;
  if (away == null && outcomes[1]) away = Number(outcomes[1].price) || null;

  return [home, draw, away];
}

function mergeOpeningCurrentMarketBlock(prevBlock, providers) {
  // prevBlock schema: { Book: [{open,current,delta}, ... legs] }
  const out = {};

  const prev = prevBlock || {};

  for (const p of (providers || [])) {
    const book = p.book;
    const legs = p.legs || [];
    const prevLegs = Array.isArray(prev[book]) ? prev[book] : [];

    const merged = [];
    for (let i = 0; i < 3; i++) {
      const cur = toNum(legs[i]);
      const prevLeg = prevLegs[i] || null;
      const open = prevLeg && prevLeg.open != null ? toNum(prevLeg.open) : cur;

      const delta = (open != null && cur != null) ? (cur - open) : null;
      merged.push({ open, current: cur, delta });
    }
    out[book] = merged;
  }

  // Also keep any books we had before (freeze opening + keep last current)
  // This prevents UI flicker if API doesn't return a book this run.
  for (const book of Object.keys(prev)) {
    if (out[book]) continue;
    out[book] = prev[book];
  }

  return out;
}

// ---------- Book normalization (UI) ----------
function normalizeBookName(name){
  const raw = String(name || "").trim();
  const up = raw.toUpperCase();

  if (up.includes("STOIXIMAN")) return "Stoiximan";
  if (up.includes("PAMESTOIXIMA") || up.includes("PAME STOIXIMA")) return "Pamestoixima";
  if (up.includes("NOVIBET")) return "Novibet";
  if (up.includes("BETSSON")) return "Betsson";

  if (up.includes("UNIBET")) return "Unibet";
  if (up.includes("BET365") || up.includes("BET 365")) return "Bet365";
  if (up === "BWIN" || up.includes(" BWIN")) return "Bwin";

  if (up.includes("PINNACLE")) return "Pinnacle";
  if (up.includes("SBOBET")) return "SBOBET";
  if (up.includes("188BET") || up.includes("188 BET")) return "188Bet";

  if (up.includes("BETFAIR")) return "Betfair";

  return raw || "Book";
}

// ---------- Utils ----------
function dayKeyGR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function addDays(yyyy_mm_dd, n) {
  const [y, m, d] = String(yyyy_mm_dd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m - 1), d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + Number(n || 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(dt);
}

function clampInt(v, def, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return Math.floor(n);
}

function groupBy(arr, keyFn) {
  const out = Object.create(null);
  for (const it of (arr || [])) {
    const k = keyFn(it);
    if (!k) continue;
    if (!out[k]) out[k] = [];
    out[k].push(it);
  }
  return out;
}

function normTeam(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\.\-'"`]/g, "")
    .trim();
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeJson(txt, fallback) {
  try { return txt ? JSON.parse(txt) : fallback; }
  catch { return fallback; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
