/* =========================================================
   VALUE ADAPTER (one-shot daily static value)
========================================================= */

(function () {
  console.log("[value-adapter] boot:start");

  if (!window.on || !window.emit) {
    console.warn("[value-adapter] boot:missing-bus", {
      hasOn: !!window.on,
      hasEmit: !!window.emit
    });
    return;
  }

  console.log("[value-adapter] boot:bus-ok");

  const RAW_FETCH = window.__AIML_RAW_FETCH__ || window.fetch;

  const TZ = "Europe/Athens";
  const BASE =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
      ? window.AIML_LIVE_CFG.fixturesBase
      : (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
        ? window.AIML_CONFIG.BASE_URL
        : "http://localhost:3010";

  const ENDPOINT =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.valuePicksPath) ||
    "/value-picks";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function ymdTodayAthens() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const d = parts.find(p => p.type === "day")?.value;

      return `${y}-${m}-${d}`;
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  async function fetchValue(dateYmd) {
    const url =
      (BASE ? BASE.replace(/\/$/, "") : "http://localhost:3010") +
      ENDPOINT +
      `?date=${encodeURIComponent(dateYmd)}`;

    try {
      console.log("[value-adapter] fetch:start", url);

      const r = await RAW_FETCH(url, {
        cache: "no-store"
      });

      console.log("[value-adapter] fetch:status", r.status, url);

      if (!r.ok) {
        console.warn("[value-adapter] fetch failed", r.status);
        return null;
      }

      return await r.json();
    } catch (err) {
      console.warn("[value-adapter] fetch error", err);
      return null;
    }
  }

  
  function toBand(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "LOW";
    if (n >= 0.72) return "HIGH";
    if (n >= 0.57) return "MEDIUM";
    return "LOW";
  }

// The engine emits short market codes (OU25, BTTS, 1X2); older payloads used
// display names ("Over / Under 2.5"). Normalize both to one key so the panel
// filter cannot silently drop picks over naming.
const MARKET_KEYS = {
  "OU15": "OU15", "Over / Under 1.5": "OU15",
  "OU25": "OU25", "Over / Under 2.5": "OU25",
  "OU35": "OU35", "Over / Under 3.5": "OU35",
  "BTTS": "BTTS",
  "1X2": "1X2",
};

const PANEL_THRESHOLDS = {
  OU15: 0.70,
  OU35: 0.66,
  BTTS: 0.66,
  "1X2": 0.64,
  OU25: 0.58,
};

function normalizePick(p) {
  const score =
    typeof p?.score === "number" && Number.isFinite(p.score)
      ? p.score
      : typeof p?.modelProb === "number" && Number.isFinite(p.modelProb)
        ? p.modelProb
        : typeof p?.confidence === "number" && Number.isFinite(p.confidence)
          ? p.confidence
          : 0;

  const confidenceNum =
    typeof p?.confidence === "number" && Number.isFinite(p.confidence)
      ? p.confidence
      : score;

  // The engine sends confidence as a band string ("high"/"medium"/"low");
  // older payloads sent a number. Accept both.
  const confidenceBand =
    typeof p?.confidence === "string" && p.confidence
      ? String(p.confidence).toUpperCase()
      : toBand(confidenceNum);

  return {
    ...p,

    market: p?.market ?? p?.marketName ?? "—",
    marketName: p?.marketName ?? p?.market ?? "—",
    pick: p?.pick ?? "—",

    home: p?.home ?? p?.homeTeam ?? "—",
    away: p?.away ?? p?.awayTeam ?? "—",

    kickoff_ms:
      typeof p?.kickoff_ms === "number"
        ? p.kickoff_ms
        : (p?.kickoff || p?.kickoffUtc)
          ? Date.parse(p.kickoff || p.kickoffUtc)
          : null,

    homeTeam: p?.homeTeam ?? p?.home ?? "—",
    awayTeam: p?.awayTeam ?? p?.away ?? "—",

    score,
    confidence: confidenceBand,
    confidenceValue: confidenceNum,

    includeInPanel: (() => {
      const rawMarket = String(p?.market ?? p?.marketName ?? "").trim();
      const marketKey = MARKET_KEYS[rawMarket];
      const scoreNum = Number(score);

      if (!marketKey) return false;
      if (!Number.isFinite(scoreNum)) return false;

      return scoreNum >= PANEL_THRESHOLDS[marketKey];
    })()
  };
}

  async function refreshOnce(dateYmd) {
    const date = dateYmd || ymdTodayAthens();
    const data = await fetchValue(date);

    if (!data) return;

    const rawItems = Array.isArray(data?.picks)
      ? data.picks
      : Array.isArray(data?.items)
        ? data.items
        : [];

    const normalizedItems = rawItems
      .map(normalizePick)
      .filter(p => p.includeInPanel);

    console.log(
      `[value-adapter] update ${date} raw=${rawItems.length} panel=${normalizedItems.length}`
    );

    const payload = {
      ok: true,
      source: "value",
      date,
      total: normalizedItems.length,
      picks: normalizedItems,
      items: normalizedItems
    };

    console.log("[value-adapter] emit payload", {
      date,
      total: payload.total,
      sample: payload.picks[0] || null
    });

    // Replay cache: value-picks.js may load after this adapter emits.

    // Keep the last daily value payload so late subscribers can render it.

    window.__AIML_LAST_VALUE = payload;

    window.__AIML_LAST_VALUE_AT = Date.now();

    emit("value-picks:loaded", payload);
    emit("value:update", payload);
  }

  setTimeout(() => {
    console.log("[value-adapter] boot:initial-refresh");
    refreshOnce();
  }, 100);
})();