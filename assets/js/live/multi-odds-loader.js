// multi-odds-loader.js
// Fetches per-bookmaker odds from /api/multi-odds on match selection.
// Emits "odds-snapshot:multi" with { matchId, markets: { "1X2": { greek, european, asian, betfair } } }

(function () {
  "use strict";

  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[multi-odds-loader] event bus not ready");
    return;
  }

  const CFG  = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
  const BASE = CFG.BASE_URL || CFG.fixturesBase || "";

  if (!BASE) { console.warn("[multi-odds-loader] missing BASE_URL"); return; }

  let IN_FLIGHT = false;

  window.on("match-selected", function (m) {
    const id = m && m.id != null ? String(m.id) : null;
    if (!id) return;
    fetchMultiOdds(id);
  });

  async function fetchMultiOdds(matchId) {
    if (IN_FLIGHT) return;
    IN_FLIGHT = true;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const url  = `${BASE}/api/multi-odds?matchId=${encodeURIComponent(matchId)}&date=${date}`;
      const res  = await fetch(url, { cache: "no-store" });
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
