/* =========================================================
   VALUE ADAPTER (anti-429 patch)
========================================================= */

(function () {
  console.log("[value-adapter] boot:start");

  let __AIML_VALUE_BOUND_DATE = null;
  let __AIML_VALUE_LAST_HASH = null;
  let __AIML_VALUE_DATASET_VERSION = null;

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


  const ENDPOINT = (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.valuePicksPath) || "/value-picks";

  // ✅ Anti-429 guard (cooldown + backoff)
  let __AIML_VALUE_LAST_FETCH_MS = 0;
  let __AIML_VALUE_INFLIGHT = false;
  let __AIML_VALUE_BACKOFF_UNTIL = 0;

  const __AIML_VALUE_COOLDOWN_MS = 30_000;   // 30s cooldown (prevents spam)
  const __AIML_VALUE_BACKOFF_429_MS = 60_000; // 60s backoff on 429

  function pad2(n) { return String(n).padStart(2, "0"); }

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
    const now = Date.now();

    // ✅ prevent parallel requests
    if (__AIML_VALUE_INFLIGHT) return null;

    // ✅ if we are rate limited, wait
    if (now < __AIML_VALUE_BACKOFF_UNTIL) return null;

    // ✅ cooldown: do not hammer endpoint
    if (now - __AIML_VALUE_LAST_FETCH_MS < __AIML_VALUE_COOLDOWN_MS) return null;

    const url =
      (BASE ? BASE.replace(/\/$/, "") : "http://localhost:3010") +
      ENDPOINT +
      `?date=${encodeURIComponent(dateYmd)}`;

    __AIML_VALUE_INFLIGHT = true;

    try {
      const r = await RAW_FETCH(url, {
        cache: "no-store",
      });

      if (r.status === 429) {
        __AIML_VALUE_BACKOFF_UNTIL = Date.now() + __AIML_VALUE_BACKOFF_429_MS;
        console.warn("[value-adapter] 429 rate-limited -> backoff 60s");
        return null;
      }

      if (!r.ok) {
        console.warn("[value-adapter] fetch failed", r.status);
        return null;
      }

      const data = await r.json();
      __AIML_VALUE_LAST_FETCH_MS = Date.now();
      return data;
    } catch (err) {
      console.warn("[value-adapter] fetch error", err);
      return null;
    } finally {
      __AIML_VALUE_INFLIGHT = false;
    }
  }

  
  function datasetVersionFromPayload(payload) {
    const arr =
      Array.isArray(payload?.matches)
        ? payload.matches
        : [];

    if (!arr.length) return null;

    return arr
      .map(m => String(m.id))
      .sort()
      .join("|");
  }

async function refresh(dateYmd) {
  const date = dateYmd || ymdTodayAthens();
  const data = await fetchValue(date);

  // if blocked by cooldown/backoff -> keep last UI state (no spam)
  if (!data) return;

  const rawItems = Array.isArray(data.picks)
    ? data.picks
    : Array.isArray(data.items)
      ? data.items
      : [];

  const LOW_MAX = 0.57;
  const MEDIUM_MAX = 0.72;
  const LOW_NEAR_MEDIUM_MIN = 0.54;

  function toBand(x) {
    const n = Number(x);
    if (!Number.isFinite(n)) return "LOW";
    if (n >= MEDIUM_MAX) return "HIGH";
    if (n >= LOW_MAX) return "MEDIUM";
    return "LOW";
  }

  function normalizePick(p) {
    const score =
      typeof p?.score === "number"
        ? p.score
        : typeof p?.confidence === "number"
          ? p.confidence
          : 0;

    const confidenceNum =
      typeof p?.confidence === "number"
        ? p.confidence
        : score;

    const confidenceBand = toBand(confidenceNum);

    return {
      ...p,

      // UI canonical fields
      home: p?.home ?? p?.homeTeam ?? "—",
      away: p?.away ?? p?.awayTeam ?? "—",
      kickoff_ms:
        typeof p?.kickoff_ms === "number"
          ? p.kickoff_ms
          : (p?.kickoff ? Date.parse(p.kickoff) : null),

      // keep original too
      homeTeam: p?.homeTeam ?? p?.home ?? "—",
      awayTeam: p?.awayTeam ?? p?.away ?? "—",

      // UI expects score + confidence
      score,
      confidence: confidenceBand,
      confidenceValue: confidenceNum,

      // panel filtering policy
      includeInPanel:
        confidenceBand === "HIGH" ||
        confidenceBand === "MEDIUM" ||
        (confidenceBand === "LOW" && confidenceNum >= LOW_NEAR_MEDIUM_MIN)
    };
  }

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
    items: normalizedItems // keep backward compatibility for older listeners
  };

  console.log("[value-adapter] emit payload", {
    date,
    total: payload.total,
    sample: payload.picks[0] || null
  });

  emit("value-picks:loaded", payload);
  emit("value:update", payload);
}

  // ✅ Run once on load (safe)
  setTimeout(() => {
    console.log("[value-adapter] boot:initial-refresh");
    refresh();
  }, 250);

  // ✅ Trigger VALUE when STAGING fixtures DATASET changes
on("today-matches:loaded", (payload) => {
  console.log("[value-adapter] today-matches:loaded", payload);

  const version = datasetVersionFromPayload(payload);
  if (!version) return;

  // run only when fixtures dataset actually changes
  if (__AIML_VALUE_DATASET_VERSION === version) return;

  __AIML_VALUE_DATASET_VERSION = version;

  const date = (payload && payload.date)
    ? payload.date
    : ymdTodayAthens();

  refresh(date);
});

  // Optional: allow manual force refresh without spam
  on("value:refresh", (dateYmd) => {
    // bypass cooldown only if you want, but for safety we keep it respecting cooldown
    refresh(dateYmd);
  });

})();
