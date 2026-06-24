// multi-odds-loader.js
// Fetches per-bookmaker odds from /api/multi-odds on match selection.
// Emits "odds-snapshot:multi" with { matchId, markets: { "1X2": { greek, european, asian, betfair } } }
// Tracks active date from date-nav (date:change event) so history navigation works.

(function () {
  "use strict";

  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[multi-odds-loader] event bus not ready");
    return;
  }

  const CFG  = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
  const BASE = CFG.BASE_URL || CFG.fixturesBase || "";

  if (!BASE) { console.warn("[multi-odds-loader] missing BASE_URL"); return; }

  // Track active date from date navigation; default to Athens today
  function athensToday() {
    var now = new Date();
    return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  let activeDate = athensToday();
  let IN_FLIGHT  = false;

  window.on("date:change", function (payload) {
    if (payload && payload.date) {
      activeDate = payload.date;
      // Clear OIC when date changes (stale match selected from previous date)
      window.emit("odds-snapshot:multi", { matchId: null, markets: {} });
    }
  });

  window.on("match-selected", function (m) {
    const id = m && m.id != null ? String(m.id) : null;
    if (!id) return;
    // Use match's own date if available (from date-nav-loader payload), else activeDate
    const date = (m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) ? m.date : activeDate;
    fetchMultiOdds(id, date);
  });

  async function fetchMultiOdds(matchId, date) {
    if (IN_FLIGHT) return;
    IN_FLIGHT = true;
    try {
      const url = `${BASE}/api/multi-odds?matchId=${encodeURIComponent(matchId)}&date=${encodeURIComponent(date)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      if (!j?.ok || !j.markets) return;
      window.emit("odds-snapshot:multi", { matchId, markets: j.markets });
    } catch (e) {
      console.warn("[multi-odds-loader]", e);
    } finally {
      IN_FLIGHT = false;
    }
  }
})();
