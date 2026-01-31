/**
 * AIMATCHLAB – VALUE ENGINE WORKER (PATCHED)
 * Responsibilities:
 * - Produce daily value picks summary for UI:
 *     Writes: VALUE:SUMMARY:<YYYY-MM-DD>
 * - Keep legacy/stat payload for evaluation:
 *     Writes: VALUE:STAT:DATE:<YYYY-MM-DD>
 * - FT evaluation CSV:
 *     Writes: VALUE:EVAL:CSV:DATE:<YYYY-MM-DD>
 *
 * Notes:
 * - This patch fixes `totalPRE` ReferenceError.
 * - Produces 1 row per market (BTTS, DC, 1X2, OVER/UNDER 1.5/2.5/3.5).
 * - Score is written as % based on confidence (LOW/MEDIUM/HIGH).
 */

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
   Writes:
     - VALUE:STAT:DATE:YYYY-MM-DD (JSON)  (legacy/eval)
     - VALUE:SUMMARY:YYYY-MM-DD   (JSON)  (UI)
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
  const totalPRE = matches.filter(m => String(m?.status).toUpperCase() === "PRE").length;

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
  const summaryItems = [];

  let skippedCups = 0;
  let skippedNoStats = 0;

  for (const m of matches) {
    if (!m) continue;
    const st = String(m.status || "").toUpperCase();
    const isPRE = (st === "PRE" || st === "STATUS_SCHEDULED");
    if (!isPRE) continue;



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
    if (!markets || Object.keys(markets).length === 0) continue;

    // legacy per-match blob (kept for eval/backtest)
    results.push({
      matchId: m.id,
      league: found.leagueCode,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName || m.leagueSlug || found.leagueCode,
      kickoff: m.kickoff,
      home: m.home,
      away: m.away,
      markets
    });

    // UI summary: 1 row per market
    const flat = flattenMarkets(markets);
    
for (const it of flat) {
      const confidence = String(it.confidence || "LOW").toUpperCase();
      const scorePct = confidenceScorePercent(confidence);

      // ✅ Keep LOW, but only if it's "borderline" (near MEDIUM threshold) per market.
      const p = typeof it.probability === "number" ? it.probability : (typeof it.prob === "number" ? it.prob : null);

      const LOW_MIN_BY_MARKET = {
        BTTS: MARKET_THRESHOLDS.BTTS.lowMin,

        OVER_15: MARKET_THRESHOLDS.OVER_15.lowMin,
        UNDER_15: MARKET_THRESHOLDS.UNDER_15.lowMin,

        OVER_25: MARKET_THRESHOLDS.OVER_25.lowMin,
        UNDER_25: MARKET_THRESHOLDS.UNDER_25.lowMin,

        OVER_35: MARKET_THRESHOLDS.OVER_35.lowMin,
        UNDER_35: MARKET_THRESHOLDS.UNDER_35.lowMin,
      };

      if (confidence === "LOW") {
        const lowMin = LOW_MIN_BY_MARKET[it.market] ?? null;
        if (lowMin != null) {
          if (p == null || p < lowMin) continue; // skip weak LOW
        } else {
          // unknown market: don't keep LOW
          continue;
        }
      }

      summaryItems.push({
matchId: String(m.id || ""),
        leagueSlug: m.leagueSlug || "",
        leagueName: m.leagueName || m.leagueSlug || "",
        kickoff: m.kickoff || "",
        home: m.home || "",
        away: m.away || "",

        market: normalizeMarketLabel(it.market),
        pick: normalizePickLabel(it.market, it.prediction),
        confidence,
        score: scorePct
      });
    }
  }

  // --- Write legacy STAT key (kept)
  const outKey = `VALUE:STAT:DATE:${date}`;
  await env.AIMATCHLAB_KV_CORE.put(
    outKey,
    JSON.stringify(
      {
        date,
        season: latest,
        totalMatches: matches.length,
            produced: results.length,
        skippedCups,
        skippedNoStats,
        results
      },
      null,
      2
    )
  );

  // --- Write UI SUMMARY key (required by main/UI)
  const summaryKey = `VALUE:SUMMARY:${date}`;
  const summaryPayload = {
    date,
    createdAt: Date.now(),
    season: latest,
    totalMatches: matches.length,
    producedItems: summaryItems.length,
    producedMatches: results.length,
    skippedCups,
    skippedNoStats,
    items: summaryItems
  };

  await env.AIMATCHLAB_KV_CORE.put(summaryKey, JSON.stringify(summaryPayload));

  return json({
    ok: true,
    date,
    season: latest,
    totalMatches: matches.length,
    producedMatches: results.length,
    producedItems: summaryItems.length,
    skippedCups,
    skippedNoStats,
    writtenKey: outKey,
    writtenSummaryKey: summaryKey
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
    if (String(m.status).toUpperCase() === "FT" && isFiniteNum(m.scoreHome) && isFiniteNum(m.scoreAway)) {
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
      continue;
    }

    const home = p.home || "";
    const away = p.away || "";
    const league = p.league || p.leagueSlug || "";

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
   SCORE MAPPING (Confidence -> %)
====================================================== */

function confidenceScorePercent(confidence) {
  const c = String(confidence || "").toUpperCase();
  if (c === "HIGH") return 75;
  if (c === "MEDIUM") return 62;
  return 52; // LOW / default
}

/* ======================================================
   LABEL NORMALIZERS (for UI)
====================================================== */

function normalizeMarketLabel(market) {
  const m = String(market || "").toUpperCase().replaceAll(" ", "");
  if (m === "BTTS") return "BTTS";
  if (m === "DC" || m === "DOUBLECHANCE") return "DC";
  if (m === "1X2") return "1X2";

  if (m.includes("OVER_15")) return "O/U 1.5";
  if (m.includes("UNDER_15")) return "O/U 1.5";
  if (m.includes("OVER_25")) return "O/U 2.5";
  if (m.includes("UNDER_25")) return "O/U 2.5";
  if (m.includes("OVER_35")) return "O/U 3.5";
  if (m.includes("UNDER_35")) return "O/U 3.5";

  return market || "";
}

function normalizePickLabel(market, prediction) {
  const m = String(market || "").toUpperCase().replaceAll(" ", "");
  const p = String(prediction || "").toUpperCase().replaceAll(" ", "");

  if (m === "BTTS") return p || "YES";
  if (m === "DC") return p;
  if (m === "1X2") return p;

  if (m.includes("OVER_")) return "OVER";
  if (m.includes("UNDER_")) return "UNDER";

  return p;
}

/* ======================================================
   MARKET BUILD (TESTING MODE – keep all)
====================================================== */


function pickOverUnder(labelOver, labelUnder, pOver, marketOver, marketUnder) {
  const tOver = MARKET_THRESHOLDS[marketOver] || null;
  const tUnder = MARKET_THRESHOLDS[marketUnder] || null;

  // fallback defaults (should rarely be needed)
  const hiOver = tOver?.hi ?? 0.65;
  const medOver = tOver?.med ?? 0.56;

  const hiUnder = tUnder?.hi ?? 0.65;
  const medUnder = tUnder?.med ?? 0.56;

  if (typeof pOver !== "number" || !isFinite(pOver)) {
    return { label: labelOver, confidence: "LOW", prob: 0.5, side: "OVER" };
  }

  if (pOver >= 0.5) {
    return { label: labelOver, confidence: tier(pOver, hiOver, medOver), prob: pOver, side: "OVER" };
  }

  const pUnder = 1 - pOver;
  return { label: labelUnder, confidence: tier(pUnder, hiUnder, medUnder), prob: pUnder, side: "UNDER" };
}

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
      confidence: tier(bttsProb, MARKET_THRESHOLDS.BTTS.hi, MARKET_THRESHOLDS.BTTS.med)
    };
  }

  // --- Over/Under heuristic
  const gfH = safeNum(home.goals_for_avg);
  const gfA = safeNum(away.goals_for_avg);
  const xG = gfH + gfA;

  const pOver15 = clamp01(0.50 + (xG - 1.5) * 0.25);
  const pOver25 = clamp01(0.50 + (xG - 2.5) * 0.20);
  const pOver35 = clamp01(0.50 + (xG - 3.5) * 0.18);
  // ✅ ONE pick per line (either OVER or UNDER) to avoid duplicate entries in UI
  const ou15 = pickOverUnder("O/U 1.5", "U/O 1.5", pOver15, "OVER_15", "UNDER_15");
  const ou25 = pickOverUnder("O/U 2.5", "U/O 2.5", pOver25, "OVER_25", "UNDER_25");
  const ou35 = pickOverUnder("O/U 3.5", "U/O 3.5", pOver35, "OVER_35", "UNDER_35");

  markets.ou15 = {
    market: ou15.side === "OVER" ? "OVER_15" : "UNDER_15",
    prediction: ou15.side,
    prob: round(ou15.prob),
    confidence: ou15.confidence
  };

  markets.ou25 = {
    market: ou25.side === "OVER" ? "OVER_25" : "UNDER_25",
    prediction: ou25.side,
    prob: round(ou25.prob),
    confidence: ou25.confidence
  };

  markets.ou35 = {
    market: ou35.side === "OVER" ? "OVER_35" : "UNDER_35",
    prediction: ou35.side,
    prob: round(ou35.prob),
    confidence: ou35.confidence
  };
// --- DC / 1X2 from goals_for_avg diff (simple)
  const delta = gfH - gfA;

  if (muOk) {
    if (delta >= 0.20) markets.dc = { market: "DC", prediction: "1X", confidence: delta >= 0.35 ? "HIGH" : "MEDIUM" };
    else if (delta <= -0.20) markets.dc = { market: "DC", prediction: "X2", confidence: delta <= -0.35 ? "HIGH" : "MEDIUM" };
    else markets.dc = { market: "DC", prediction: "12", confidence: "LOW" };
  }

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

    if (typeof v === "object" && v.market) {
      out.push({
        market: String(v.market),
        prediction: v.prediction || "",
        probability: typeof v.prob === "number" ? v.prob : (typeof v.probability === "number" ? v.probability : null),
        confidence: v.confidence || ""
      });
      continue;
    }

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
        confidence: v.confidence || ""
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
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

    if (league?.[home] && league?.[away]) {
      return { leagueCode, homeStats: league[home], awayStats: league[away] };
    }

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

// =====================================================================
// ✅ MARKET THRESHOLDS (single source of truth)
// - hi: HIGH threshold
// - med: MEDIUM threshold
// - lowMin: minimum probability to keep LOW (borderline LOW window)
// =====================================================================

/* ======================================================================
   ✅ LOW WINDOW FILTER (Borderline LOW only)
   - We only show LOW picks that are close to the market's LOW threshold.
   - Prevents spam like 50-53% LOW everywhere.
====================================================================== */
function isBorderlineLowPick(item, lowMin, window = 0.02) {
  // allow LOW only in [lowMin, lowMin + window)
  const p = (item && (item.probability ?? item.prob ?? item.p ?? item.score ?? null));
  if (typeof p !== "number") return true; // if unknown, don't hard drop
  return p >= lowMin && p < (lowMin + window);
}

const MARKET_THRESHOLDS = {
  BTTS:     { hi: 0.62, med: 0.56, lowMin: 0.54 },

  OVER_15:  { hi: 0.70, med: 0.60, lowMin: 0.58 },
  UNDER_15: { hi: 0.70, med: 0.60, lowMin: 0.58 },

  OVER_25:  { hi: 0.65, med: 0.56, lowMin: 0.54 },
  UNDER_25: { hi: 0.65, med: 0.56, lowMin: 0.54 },

  OVER_35:  { hi: 0.55, med: 0.48, lowMin: 0.46 },
  UNDER_35: { hi: 0.55, med: 0.48, lowMin: 0.46 },
};


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
  
    /* ✅ APPLY BORDERLINE LOW FILTER */
    try {
      const LOW_WINDOW = (MARKET_THRESHOLDS && MARKET_THRESHOLDS.__LOW_WINDOW) || 0.02;

      items = (items || []).filter((it) => {
        const conf = String(it.confidence || "").toUpperCase();
        if (conf !== "LOW") return true;

        const mkt = String(it.market || it.marketKey || it.type || "").toUpperCase();
        const cfg = MARKET_THRESHOLDS[mkt] || MARKET_THRESHOLDS[(it.market||"")] || null;
        const lowMin = (cfg && typeof cfg.lowMin === "number") ? cfg.lowMin : 0.50;

        return isBorderlineLowPick(it, lowMin, LOW_WINDOW);
      });
    } catch (e) {
      // fail-open
    }

return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" }
  });
}
