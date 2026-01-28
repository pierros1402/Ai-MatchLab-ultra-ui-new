export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/run") {
      return runValueEngine(env, url);
    }

    if (url.pathname === "/internal/eval") {
      return runEvaluation(env, url);
    }

    return new Response("Not Found", { status: 404 });
  }
};

/* ======================================================
   PRE VALUE ENGINE – STATISTICS ONLY (NO ODDS)
   Writes: VALUE:STAT:DATE:YYYY-MM-DD (JSON)
====================================================== */

async function runValueEngine(env, url) {
  const date = url.searchParams.get("date") || isoToday();

  // --- Fixtures (PRE)
  const fixturesKey = `FIXTURES:DATE:${date}`;
  const fixturesRaw = await env.AIMATCHLAB_KV_CORE.get(fixturesKey);
  if (!fixturesRaw) return json({ ok: false, reason: "no_fixtures", date });

  let fixtures;
  try {
    fixtures = JSON.parse(fixturesRaw);
  } catch {
    return json({ ok: false, reason: "fixtures_invalid_json", date });
  }

  const matches = Array.isArray(fixtures.matches) ? fixtures.matches : [];

  // --- TEAM_STATS index (with newline fallback)
  let indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
  if (!indexRaw) indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX\n");
  if (!indexRaw) return json({ ok: false, reason: "missing_team_stats_index" });

  let latest;
  try {
    latest = JSON.parse(indexRaw).latest;
  } catch {
    return json({ ok: false, reason: "invalid_team_stats_index" });
  }
  if (!latest) return json({ ok: false, reason: "team_stats_index_no_latest" });

  const statsRaw = await env.AIMATCHLAB_STATS.get(`TEAM_STATS:SEASON:${latest}`);
  if (!statsRaw) {
    return json({ ok: false, reason: "missing_team_stats_season", season: latest });
  }

  let leagues;
  try {
    leagues = JSON.parse(statsRaw).leagues || {};
  } catch {
    return json({ ok: false, reason: "invalid_team_stats_season", season: latest });
  }

  const results = [];
  let skippedCups = 0;
  let skippedNoStats = 0;

  for (const m of matches) {
    if (!m || m.status !== "PRE") continue;

    if (isDomesticCup(m.leagueSlug)) {
      skippedCups++;
      continue;
    }

    const found = findStatsForTeams(leagues, m.home, m.away);
    if (!found) {
      skippedNoStats++;
      continue;
    }

    const markets = buildMarkets_AllForTesting(found.homeStats, found.awayStats);
    // Για testing: κρατάμε αγώνα αν υπάρχει έστω 1 market
    if (!markets || Object.keys(markets).length === 0) continue;

    results.push({
      matchId: m.id,
      league: found.leagueCode,
      leagueSlug: m.leagueSlug,
      kickoff: m.kickoff,
      home: m.home,
      away: m.away,
      markets
    });
  }

  const outKey = `VALUE:STAT:DATE:${date}`;
  await env.AIMATCHLAB_KV_CORE.put(
    outKey,
    JSON.stringify(
      {
        date,
        season: latest,
    totalMatches: matches.length,
    totalPRE,
        produced: results.length,
        skippedCups,
        skippedNoStats,
        results
      },
      null,
      2
    )
  );

    const totalPRE = matches.filter(m => String(m?.status).toUpperCase() === "PRE").length;
return json({
    ok: true,
    date,
    season: latest,
    totalMatches: matches.length,
    totalPRE,
    produced: results.length,
    skippedCups,
    skippedNoStats,
    writtenKey: outKey
  });
}

/* ======================================================
   FT EVALUATION – CSV (EXCEL FRIENDLY)
   Reads:
     - VALUE:STAT:DATE:<date>
     - FIXTURES:DATE:<date> (FT scores)
   Writes:
     - VALUE:EVAL:CSV:DATE:<date>
====================================================== */

async function runEvaluation(env, url) {
  const date = url.searchParams.get("date") || isoYesterday();

  const valueKey = `VALUE:STAT:DATE:${date}`;
  const fixturesKey = `FIXTURES:DATE:${date}`;
  const outCsvKey = `VALUE:EVAL:CSV:DATE:${date}`;

  const [valueRaw, fixturesRaw] = await Promise.all([
    env.AIMATCHLAB_KV_CORE.get(valueKey),
    env.AIMATCHLAB_KV_CORE.get(fixturesKey)
  ]);

  if (!valueRaw) return json({ ok: false, reason: "missing_value_predictions", date, key: valueKey });
  if (!fixturesRaw) return json({ ok: false, reason: "missing_fixtures", date, key: fixturesKey });

  let valueDoc, fixturesDoc;
  try {
    valueDoc = JSON.parse(valueRaw);
  } catch {
    return json({ ok: false, reason: "value_invalid_json", date });
  }
  try {
    fixturesDoc = JSON.parse(fixturesRaw);
  } catch {
    return json({ ok: false, reason: "fixtures_invalid_json", date });
  }

  const preds = Array.isArray(valueDoc.results) ? valueDoc.results : [];
  const matches = Array.isArray(fixturesDoc.matches) ? fixturesDoc.matches : [];

  // Map FT by matchId
  const ftById = new Map();
  for (const m of matches) {
    if (!m || !m.id) continue;
    if (m.status === "FT" && isFiniteNum(m.scoreHome) && isFiniteNum(m.scoreAway)) {
      ftById.set(String(m.id), m);
    }
  }

  // CSV header (fixed, readable)
  const header = [
    "Date",
    "League",
    "Match",
    "Market",
    "Prediction",
    "Probability",
    "Confidence",
    "FT_Score",
    "FT_Result",
    "Success"
  ];

  const rows = [header];

  let totalMarkets = 0;
  let settled = 0;
  let win = 0;
  let loss = 0;
  let voided = 0;
  let missingFT = 0;

  for (const p of preds) {
    const matchId = String(p.matchId || "");
    if (!matchId) continue;

    const ft = ftById.get(matchId);
    if (!ft) {
      missingFT++;
      continue; // δεν γράφουμε γραμμές χωρίς FT (θα αξιολογηθεί άλλη μέρα αν γίνει late FT)
    }

    const home = p.home || "";
    const away = p.away || "";
    const league = p.league || "";

    const ftHome = Number(ft.scoreHome);
    const ftAway = Number(ft.scoreAway);

    const markets = p.markets || {};
    const flat = flattenMarkets(markets);

    for (const item of flat) {
      totalMarkets++;

      const settlement = settleMarket(item, ftHome, ftAway);
      if (settlement.success === "VOID") voided++;
      else if (settlement.success === "WIN") win++;
      else if (settlement.success === "LOSS") loss++;

      if (settlement.success !== "PENDING") settled++;

      rows.push([
        date,
        league,
        `${home} - ${away}`,
        item.market,
        item.prediction || "",
        item.probability ?? "",
        item.confidence || "",
        `${ftHome}-${ftAway}`,
        settlement.ftResult,
        settlement.success
      ]);
    }
  }

  const csv = toCsv(rows);

  await env.AIMATCHLAB_KV_CORE.put(outCsvKey, csv);

  return json({
    ok: true,
    date,
    wrote: outCsvKey,
    totalMarkets,
    settled,
    win,
    loss,
    voided,
    missingFT_matches: missingFT
  });
}

/* ======================================================
   MARKET BUILD (TESTING MODE – keep all)
   - BTTS
   - O/U 1.5 / 2.5 / 3.5
   - DC
   - 1X2 (1/2 only, no draw)  [αν θες, το βάζουμε και X]
====================================================== */

function buildMarkets_AllForTesting(home, away) {
  if (!home || !away) return {};

  const markets = {};

  const muOk = (home.matches_used || 0) >= 5 && (away.matches_used || 0) >= 5;

  // --- BTTS prob (if available)
  if (typeof home.btts_rate === "number" && typeof away.btts_rate === "number") {
    const bttsProb = (home.btts_rate + away.btts_rate) / 2;
    markets.btts = {
      market: "BTTS",
      prediction: "YES",
      prob: round(bttsProb),
      confidence: tier(bttsProb, 0.62, 0.56) // HIGH>=0.62, MED>=0.56, else LOW
    };
  }

  // --- Over/Under lines: use expected goals heuristic (no odds)
  // Very simple: xG = gf_home + gf_away (as you already use)
  const gfH = safeNum(home.goals_for_avg);
  const gfA = safeNum(away.goals_for_avg);
  const xG = gfH + gfA;

  // Prob approx (0..1) from distance to line, smooth but simple
  // Not “true probability”, but good for testing calibration later.
  const pOver15 = clamp01(0.50 + (xG - 1.5) * 0.25);
  const pOver25 = clamp01(0.50 + (xG - 2.5) * 0.20);
  const pOver35 = clamp01(0.50 + (xG - 3.5) * 0.18);

  markets.over15 = {
    market: "OVER_15",
    prediction: "OVER",
    prob: round(pOver15),
    confidence: tier(pOver15, 0.70, 0.60)
  };
  markets.under15 = {
    market: "UNDER_15",
    prediction: "UNDER",
    prob: round(1 - pOver15),
    confidence: tier(1 - pOver15, 0.70, 0.60)
  };

  markets.over25 = {
    market: "OVER_25",
    prediction: "OVER",
    prob: round(pOver25),
    confidence: tier(pOver25, 0.65, 0.56)
  };
  markets.under25 = {
    market: "UNDER_25",
    prediction: "UNDER",
    prob: round(1 - pOver25),
    confidence: tier(1 - pOver25, 0.65, 0.56)
  };

  markets.over35 = {
    market: "OVER_35",
    prediction: "OVER",
    prob: round(pOver35),
    confidence: tier(pOver35, 0.55, 0.48)
  };
  markets.under35 = {
    market: "UNDER_35",
    prediction: "UNDER",
    prob: round(1 - pOver35),
    confidence: tier(1 - pOver35, 0.70, 0.60)
  };

  // --- DC / 1X2 from goals_for_avg diff (simple)
  const delta = gfH - gfA;

  // DC
  if (muOk) {
    if (delta >= 0.20) markets.dc = { market: "DC", prediction: "1X", confidence: delta >= 0.35 ? "HIGH" : "MEDIUM" };
    else if (delta <= -0.20) markets.dc = { market: "DC", prediction: "X2", confidence: delta <= -0.35 ? "HIGH" : "MEDIUM" };
    else markets.dc = { market: "DC", prediction: "12", confidence: "LOW" };
  }

  // 1X2 (NO DRAW) – for tests
  if (muOk) {
    if (delta >= 0.40) markets["1x2"] = { market: "1X2", prediction: "1", confidence: delta >= 0.55 ? "HIGH" : "MEDIUM" };
    else if (delta <= -0.40) markets["1x2"] = { market: "1X2", prediction: "2", confidence: delta <= -0.55 ? "HIGH" : "MEDIUM" };
  }

  return markets;
}

/* ======================================================
   SETTLEMENT
====================================================== */

function settleMarket(item, ftHome, ftAway) {
  const total = ftHome + ftAway;
  const bttsYes = ftHome > 0 && ftAway > 0;

  const pred = (item.prediction || "").toUpperCase();
  const mkt = (item.market || "").toUpperCase();

  let ftResult = "";
  let success = "VOID";

  if (mkt === "BTTS") {
    ftResult = bttsYes ? "BTTS_YES" : "BTTS_NO";
    success = (pred === "YES" && bttsYes) || (pred === "NO" && !bttsYes) ? "WIN" : "LOSS";
    return { ftResult, success };
  }

  if (mkt === "OVER_15" || mkt === "UNDER_15") {
    const over = total >= 2;
    ftResult = over ? "OVER_15" : "UNDER_15";
    success = (pred === "OVER" && over) || (pred === "UNDER" && !over) ? "WIN" : "LOSS";
    return { ftResult, success };
  }

  if (mkt === "OVER_25" || mkt === "UNDER_25") {
    const over = total >= 3;
    ftResult = over ? "OVER_25" : "UNDER_25";
    success = (pred === "OVER" && over) || (pred === "UNDER" && !over) ? "WIN" : "LOSS";
    return { ftResult, success };
  }

  if (mkt === "OVER_35" || mkt === "UNDER_35") {
    const over = total >= 4;
    ftResult = over ? "OVER_35" : "UNDER_35";
    success = (pred === "OVER" && over) || (pred === "UNDER" && !over) ? "WIN" : "LOSS";
    return { ftResult, success };
  }

  if (mkt === "DC") {
    const res = ftHome > ftAway ? "1" : ftHome < ftAway ? "2" : "X";
    ftResult = res;

    if (pred === "1X") success = (res === "1" || res === "X") ? "WIN" : "LOSS";
    else if (pred === "X2") success = (res === "2" || res === "X") ? "WIN" : "LOSS";
    else if (pred === "12") success = (res === "1" || res === "2") ? "WIN" : "LOSS";
    else success = "VOID";

    return { ftResult: `DC_${ftResult}`, success };
  }

  if (mkt === "1X2") {
    const res = ftHome > ftAway ? "1" : ftHome < ftAway ? "2" : "X";
    ftResult = `1X2_${res}`;
    // Εδώ δεν έχουμε draw prediction (σύμφωνα με το setup)
    if (pred === "1") success = res === "1" ? "WIN" : "LOSS";
    else if (pred === "2") success = res === "2" ? "WIN" : "LOSS";
    else success = "VOID";
    return { ftResult, success };
  }

  return { ftResult: "", success: "VOID" };
}

/* ======================================================
   MARKET FLATTEN (supports different shapes)
====================================================== */

function flattenMarkets(marketsObj) {
  const out = [];

  for (const [k, v] of Object.entries(marketsObj || {})) {
    if (!v) continue;

    // If stored in our new shape:
    // { market:"OVER_25", prediction:"OVER", prob:0.58, confidence:"MEDIUM" }
    if (typeof v === "object" && v.market) {
      out.push({
        market: String(v.market),
        prediction: v.prediction || "",
        probability: typeof v.prob === "number" ? v.prob : (typeof v.probability === "number" ? v.probability : null),
        confidence: v.confidence || ""
      });
      continue;
    }

    // Older shape support:
    // btts: { prob: 0.61, confidence:"MEDIUM" }
    // over25: { confidence:"HIGH" }
    // dc: { pick:"1X", confidence:"HIGH" }
    // 1x2: { pick:"1", confidence:"MEDIUM" }
    if (k === "btts") {
      out.push({
        market: "BTTS",
        prediction: "YES",
        probability: typeof v.prob === "number" ? v.prob : null,
        confidence: v.confidence || ""
      });
      continue;
    }

    if (k === "dc") {
      out.push({
        market: "DC",
        prediction: v.pick || v.prediction || "",
        probability: null,
        confidence: v.confidence || ""
      });
      continue;
    }

    if (k === "1x2" || k === "1X2") {
      out.push({
        market: "1X2",
        prediction: v.pick || v.prediction || "",
        probability: null,
        confidence: v.confidence || ""
      });
      continue;
    }

    // Simple confidence-only over/under keys (best-effort mapping)
    const kk = String(k).toLowerCase();
    const map = {
      over15: { market: "OVER_15", prediction: "OVER" },
      under15: { market: "UNDER_15", prediction: "UNDER" },
      over25: { market: "OVER_25", prediction: "OVER" },
      under25: { market: "UNDER_25", prediction: "UNDER" },
      over35: { market: "OVER_35", prediction: "OVER" },
      under35: { market: "UNDER_35", prediction: "UNDER" }
    };
    if (map[kk]) {
      out.push({
        market: map[kk].market,
        prediction: map[kk].prediction,
        probability: typeof v.prob === "number" ? v.prob : null,
        confidence: v.confidence || (typeof v.confidence === "string" ? v.confidence : (v.confidence ? String(v.confidence) : ""))
      });
    }
  }

  return out;
}

/* ======================================================
   CSV
====================================================== */

function toCsv(rows) {
  return rows
    .map((r) => r.map(csvCell).join(","))
    .join("\n");
}

function csvCell(x) {
  const s = x === null || x === undefined ? "" : String(x);
  // quote if needed
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* ======================================================
   UTIL
====================================================== */

function isDomesticCup(slug) {
  if (!slug) return false;
  const s = slug.toLowerCase();
  if (s.startsWith("uefa.") || s.startsWith("caf.") || s.startsWith("afc.")) return false;
  return s.includes("cup") || s.includes("copa") || s.includes("coppa") || s.includes("trophy");
}

function normTeamName(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findStatsForTeams(leagues, home, away) {
  const h = normTeamName(home);
  const a = normTeamName(away);

  for (const leagueCode of Object.keys(leagues || {})) {
    const league = leagues[leagueCode];
    if (!league) continue;

    // fast exact hit first
    if (league?.[home] && league?.[away]) {
      return { leagueCode, homeStats: league[home], awayStats: league[away] };
    }

    // normalized index
    const keys = Object.keys(league);
    const map = new Map();
    for (const k of keys) map.set(normTeamName(k), k);

    const hk = map.get(h);
    const ak = map.get(a);

    if (hk && ak) {
      return {
        leagueCode,
        homeStats: league[hk],
        awayStats: league[ak]
      };
    }
  }
  return null;
}


function tier(p, hi, med) {
  if (typeof p !== "number") return "LOW";
  if (p >= hi) return "HIGH";
  if (p >= med) return "MEDIUM";
  return "LOW";
}

function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function safeNum(n) {
  return typeof n === "number" && isFinite(n) ? n : 0;
}

function isFiniteNum(n) {
  return typeof n === "number" && isFinite(n);
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoYesterday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" }
  });
}
