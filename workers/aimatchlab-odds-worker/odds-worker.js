/**
 * AIMATCHLAB — ODDS WORKER (FREE 4 LEAGUES)
 * Version: odds-worker_free4_v1.2.1_hotfix
 *
 * Fixes:
 * - Avoid 1101 by using KV.get({type:"json"}) (NOT "json")
 * - Safe guards for missing env bindings / missing fixtures
 * - No-throw JSON responses for /internal/run
 *
 * Reads:
 * - AIMATCHLAB_KV_CORE: FIXTURES:DATE:<YYYY-MM-DD>
 *
 * Writes:
 * - AIMATCHLAB_KV_CORE: ODDS:CORE:DATE:<YYYY-MM-DD>:MARKET:<market>
 * - AIMATCHLAB_ODDS_KV : ODDS_LAST_RUN:<YYYY-MM-DD>, ODDS_RUN_COUNT:<YYYY-MM-DD>, ODDS_WRITTEN_COUNT:<YYYY-MM-DD>
 */

const VERSION = "odds-worker_free4_v1.2.1_hotfix";
const TZ = "Europe/Athens";

const ALLOWED_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1"]; // free test scope
const MARKETS = ["1X2", "GG", "OU25"]; // free scope for UI test

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Root info
      if (url.pathname === "/" || url.pathname === "") {
        return json({
          ok: true,
          service: "aimatchlab-odds-worker",
          version: VERSION,
          markets: MARKETS,
          allowedLeagues: ALLOWED_LEAGUES,
          hint: "Use /internal/run or /internal/run?force=1",
          now: new Date().toISOString()
        });
      }

      // Internal run
      if (url.pathname === "/internal/run") {
        const force = url.searchParams.get("force") === "1";
        const date = url.searchParams.get("date") || dayKeyGR();

        const result = await runOdds(env, { date, force });
        return json(result);
      }

      return new Response("Not Found", { status: 404 });
    } catch (e) {
      // never throw, avoid 1101
      return json({ ok: false, reason: "fetch_exception", error: String(e) }, 500);
    }
  }
};

async function runOdds(env, opts = {}) {
  const startedAt = Date.now();
  const date = String(opts.date || dayKeyGR());
  const force = !!opts.force;

  // --- bindings checks ---
  if (!env?.AIMATCHLAB_KV_CORE) {
    return {
      ok: false,
      reason: "missing_binding_AIMATCHLAB_KV_CORE",
      version: VERSION,
      date
    };
  }
  if (!env?.AIMATCHLAB_ODDS_KV) {
    return {
      ok: false,
      reason: "missing_binding_AIMATCHLAB_ODDS_KV",
      version: VERSION,
      date
    };
  }

  const apiKey = (env.ODDS_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_ODDS_API_KEY",
      version: VERSION,
      date,
      note: "Add ODDS_API_KEY secret in this worker"
    };
  }

  // read fixtures from KV CORE
  const fxKey = `FIXTURES:DATE:${date}`;
  const fx = await env.AIMATCHLAB_KV_CORE.get(fxKey, { type: "json" });

  const matches = Array.isArray(fx?.matches) ? fx.matches : [];
  const eligible = matches.filter(m => ALLOWED_LEAGUES.includes(m?.leagueSlug));

  // bookkeeping keys
  const lastRunKey = `ODDS_LAST_RUN:${date}`;
  const runCountKey = `ODDS_RUN_COUNT:${date}`;
  const writtenCountKey = `ODDS_WRITTEN_COUNT:${date}`;

  // increment run counter
  const prevRunCount = Number(await env.AIMATCHLAB_ODDS_KV.get(runCountKey)) || 0;
  await env.AIMATCHLAB_ODDS_KV.put(runCountKey, String(prevRunCount + 1));
  await env.AIMATCHLAB_ODDS_KV.put(lastRunKey, String(Date.now()));

  if (!eligible.length) {
    return {
      ok: true,
      version: VERSION,
      date,
      force,
      fixturesKey: fxKey,
      fixturesTotal: matches.length,
      fixturesEligible: 0,
      writtenThisRun: 0,
      markets: MARKETS,
      allowedLeagues: ALLOWED_LEAGUES,
      note: "No eligible fixtures for allowed leagues today."
    };
  }

  // ---- ODDS FETCH (FREE API) ----
  // IMPORTANT:
  // For now we do minimal requests: 1X2 only, mapped to UI markets.
  // We will produce placeholder odds for GG/OU25 by transforming 1X2,
  // just to validate platform wiring without burning API.
  //
  // If you want real GG/OU25 odds later, we add dedicated calls.

  const perMarketWritten = {};
  let totalWritten = 0;

  // Fetch odds once (1X2)
  const oddsPayload = await fetchOdds1X2(env, apiKey);

  // Build snapshots per market
  for (const market of MARKETS) {
    const kvKey = `ODDS:CORE:DATE:${date}:MARKET:${market}`;
    const snap = buildSnapshot(date, market, eligible, oddsPayload);

    await env.AIMATCHLAB_KV_CORE.put(kvKey, JSON.stringify(snap));
    perMarketWritten[market] = { kvKey, items: snap.items.length };
    totalWritten += snap.items.length;
  }

  const prevWritten = Number(await env.AIMATCHLAB_ODDS_KV.get(writtenCountKey)) || 0;
  await env.AIMATCHLAB_ODDS_KV.put(writtenCountKey, String(prevWritten + totalWritten));

  return {
    ok: true,
    version: VERSION,
    date,
    force,
    fixturesKey: fxKey,
    fixturesTotal: matches.length,
    fixturesEligible: eligible.length,
    writtenThisRun: totalWritten,
    perMarket: perMarketWritten,
    durationMs: Date.now() - startedAt,
    note: "Run completed without throwing (no 1101)."
  };
}

async function fetchOdds1X2(env, apiKey) {
  // You can replace URL with your exact provider path.
  // This is a safe wrapper: any failure returns {ok:false,...} without throwing.
  const url = env.ODDS_API_URL
    ? String(env.ODDS_API_URL)
    : "https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso";

  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" }
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: text.slice(0, 400) };
    }

    const data = safeJson(text, null);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function buildSnapshot(date, market, eligibleFixtures, oddsPayload) {
  // Minimal snapshot schema for UI.
  // items: array of matches with providers + opening/current odds
  const items = [];

  for (const m of eligibleFixtures) {
    const id = String(m?.id || "").trim();
    if (!id) continue;

    items.push({
      fixtureId: id,
      home: m.home,
      away: m.away,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName,
      kickoff_ms: m.kickoff_ms ?? null,
      market,
      providers: demoProvidersFromOdds(oddsPayload, market)
    });
  }

  return {
    ok: true,
    date,
    market,
    createdAtMs: Date.now(),
    source: "free4_hotfix",
    oddsPayloadOk: !!oddsPayload?.ok,
    items
  };
}

function demoProvidersFromOdds(oddsPayload, market) {
  // For now: stable deterministic demo so UI renders
  // even if external odds API fails.
  // This prevents 1101 and avoids burning free quota.
  const base = market === "1X2" ? [2.05, 3.25, 3.55] : market === "GG" ? [1.80, 2.00] : [1.95, 1.95];

  return [
    {
      book: "DemoBook",
      opening: base,
      current: base,
      updatedAtMs: Date.now()
    }
  ];
}

function dayKeyGR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
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
