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
  const REQUEST_TIMEOUT_MS = 12000;
  const BASE =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
      ? window.AIML_LIVE_CFG.fixturesBase
      : (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
        ? window.AIML_CONFIG.BASE_URL
        : "http://localhost:3010";

  const ENDPOINT =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.valuePicksPath) ||
    "/value-picks";

  const COMPARISON_ENDPOINT =
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.valueComparisonPath) ||
    "/value-comparison";

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function isAbortError(error) {
    return error && (error.name === "AbortError" || error.code === 20);
  }

  function ymdTodayAthens() {
    const operational = window.AIML_OperationalDay?.getDay?.();
    if (validDay(operational)) return operational;

    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  async function rawFetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await RAW_FETCH(url, {
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function fetchValue(dateYmd) {
    const url =
      (BASE ? BASE.replace(/\/$/, "") : "http://localhost:3010") +
      ENDPOINT +
      `?date=${encodeURIComponent(dateYmd)}`;

    try {
      console.log("[value-adapter] fetch:start", url);

      const r = await rawFetchWithTimeout(url);

      console.log("[value-adapter] fetch:status", r.status, url);

      if (!r.ok) {
        console.warn("[value-adapter] fetch failed", r.status);
        return null;
      }

      return await r.json();
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("[value-adapter] fetch error", err);
      }
      return null;
    }
  }


  async function fetchComparisonUrl(url, sourceLabel) {
    try {
      console.log("[value-adapter] comparison fetch:start", sourceLabel, url);

      const r = await rawFetchWithTimeout(url);

      console.log("[value-adapter] comparison fetch:status", sourceLabel, r.status, url);

      if (r.status === 404) return null;

      if (!r.ok) {
        console.warn("[value-adapter] comparison fetch failed", sourceLabel, r.status);
        return null;
      }

      const data = await r.json();

      const requiredPlans = ["A", "A2", "B", "B2"];
      const hasAllRequiredPlans =
        data &&
        data.ok &&
        data.plans &&
        requiredPlans.every(
          planKey =>
            data.plans[planKey] &&
            typeof data.plans[planKey] === "object"
        );

      if (hasAllRequiredPlans) {
        return data;
      }

      console.warn("[value-adapter] comparison payload invalid", sourceLabel, data);
      return null;
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("[value-adapter] comparison fetch error", sourceLabel, err);
      }
      return null;
    }
  }

  async function fetchValueComparison(dateYmd) {
    const encodedDate = encodeURIComponent(dateYmd);
    const engineUrl =
      (BASE ? BASE.replace(/\/$/, "") : "http://localhost:3010") +
      COMPARISON_ENDPOINT +
      `?date=${encodedDate}`;

    // Engine release is the only public truth. A static fallback can be from a
    // different UI deploy/day and would reintroduce cross-release panels.
    return fetchComparisonUrl(engineUrl, "engine-release");
  }

  function comparisonRows(comparison, key) {
    const rows = comparison && comparison.plans && comparison.plans[key] && comparison.plans[key].picks;
    return Array.isArray(rows) ? rows : [];
  }

  function emptyPlanSummary() {
    return {
      picks: 0,
      uniqueMatches: 0,
      settled: 0,
      wins: 0,
      losses: 0,
      voids: 0,
      unresolved: 0,
      unsupported: 0,
      hitRate: null
    };
  }

  function unavailablePlan(id, label, reason) {
    return {
      id,
      label,
      status: "NOT_AVAILABLE",
      availability: "not_available",
      outputMode: "not-available",
      reason,
      count: 0,
      summary: emptyPlanSummary(),
      picks: []
    };
  }

  function unavailableComparisonPayload(date, reason) {
    const comparison = {
      ok: false,
      date,
      status: "NOT_AVAILABLE",
      availability: "not_available",
      comparisonEligible: false,
      reason,
      plans: {
        A: unavailablePlan("plan-a", "Plan A", reason),
        A2: unavailablePlan("plan-a2", "Plan A2", reason),
        B: unavailablePlan("plan-b", "Plan B", reason),
        B2: unavailablePlan("plan-b2", "Plan B2", reason)
      }
    };

    return {
      ok: false,
      source: "value-comparison-unavailable",
      mode: "plan-comparison",
      availability: "not_available",
      error: reason,
      date,
      total: 0,
      picks: [],
      items: [],
      comparison
    };
  }

  function comparisonPayloadFrom(comparison, date) {
    const planA = comparisonRows(comparison, "A");
    const planB = comparisonRows(comparison, "B");
    const planA2 = comparisonRows(comparison, "A2");
    const planB2 = comparisonRows(comparison, "B2");

    const allRows = [
      ...planA,
      ...planB,
      ...planA2,
      ...planB2
    ];

    return {
      ok: true,
      source: "value-comparison",
      mode: "plan-comparison",
      date: comparison.date || date,
      total: allRows.length,
      picks: allRows,
      items: allRows,
      comparison
    };
  }

  function emitValuePayload(payload) {
    console.log("[value-adapter] emit payload", {
      date: payload && payload.date,
      source: payload && payload.source,
      mode: payload && payload.mode,
      total: payload && payload.total,
      sample: payload && payload.picks && payload.picks[0] || null
    });

    window.__AIML_LAST_VALUE = payload;
    window.__AIML_LAST_VALUE_AT = Date.now();

    emit("value-picks:loaded", payload);
    emit("value:update", payload);
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
  "DC": "DC", "Double Chance": "DC",
};

const STRICT_PANEL_POLICY_VERSION = "statistical-value-policy-v2.2";

function isHighBand(band) {
  return String(band || "").toUpperCase() === "HIGH";
}

function pickText(pick) {
  return String(pick || "").toUpperCase().trim();
}

function passesStrictPanelPolicy({ marketKey, pick, score, confidence, band }) {
  const label = pickText(pick);

  if (!Number.isFinite(score)) return false;
  if (!Number.isFinite(confidence)) return false;

  if (label.includes("UNDER 1.5")) return false;

  if (label.includes("UNDER 2.5")) {
    return isHighBand(band) && score >= 0.78 && confidence >= 0.74;
  }

  if (label.includes("UNDER 3.5")) {
    return isHighBand(band) && score >= 0.84 && confidence >= 0.78;
  }

  if (marketKey === "OU15") {
    return label.includes("OVER 1.5") && isHighBand(band) && score >= 0.86 && confidence >= 0.76;
  }

  if (marketKey === "OU25") {
    return label.includes("OVER 2.5") && score >= 0.68 && confidence >= 0.66;
  }

  if (marketKey === "OU35") {
    return label.includes("OVER 3.5") && score >= 0.80 && confidence >= 0.74;
  }

  if (marketKey === "BTTS") {
    return label.includes("YES") && score >= 0.72 && confidence >= 0.68;
  }

  if (marketKey === "1X2") {
    if (label === "DRAW" || label === "X") {
      return isHighBand(band) && confidence >= 0.76;
    }

    return score >= 0.72 && confidence >= 0.68;
  }

  if (marketKey === "DC") {
    if (!["1X", "X2", "12"].includes(label)) return false;
    return score >= 0.78 && confidence >= 0.70;
  }

  return false;
}

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

  const engineBand = String(p?.band || confidenceBand || "LOW").toUpperCase();

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
    band: engineBand,
    panelPolicyVersion: STRICT_PANEL_POLICY_VERSION,

    includeInPanel: (() => {
      const rawMarket = String(p?.market ?? p?.marketName ?? "").trim();
      const marketKey = MARKET_KEYS[rawMarket];
      const scoreNum = Number(score);

      if (!marketKey) return false;

      return passesStrictPanelPolicy({
        marketKey,
        pick: p?.pick,
        score: scoreNum,
        confidence: confidenceNum,
        band: engineBand
      });
    })()
  };
}

  let refreshGeneration = 0;

  async function refreshOnce(dateYmd) {
    const date = validDay(dateYmd) ? dateYmd : ymdTodayAthens();
    const generation = ++refreshGeneration;
    const comparison = await fetchValueComparison(date);

    if (generation !== refreshGeneration) return;

    if (comparison) {
      const payload = comparisonPayloadFrom(comparison, date);
      emitValuePayload(payload);
      return;
    }

    const data = await fetchValue(date);

    if (generation !== refreshGeneration) return;

    if (!data || data?.ok === false) {
      const reason =
        String(
          data?.error ||
          data?.reason ||
          "value_release_unavailable"
        );

      emitValuePayload(
        unavailableComparisonPayload(
          date,
          reason
        )
      );
      return;
    }

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

  on("date:change", payload => {
    const date = String(payload?.date || "").slice(0, 10);
    if (validDay(date)) refreshOnce(date);
  });

  setTimeout(() => {
    console.log("[value-adapter] boot:initial-refresh");
    const selected = String(window.__AIML_SELECTED_DATE || "").slice(0, 10);
    refreshOnce(validDay(selected) ? selected : ymdTodayAthens());
  }, 100);
})();
