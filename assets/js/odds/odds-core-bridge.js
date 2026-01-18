(function () {
  "use strict";

  if (window.__AIML_ODDS_CORE_BRIDGE__) return;
  window.__AIML_ODDS_CORE_BRIDGE__ = true;

  const WORKER_BASE = "https://aimatchlab-main.pierros1402.workers.dev";

  /* =========================================================
     OPENING CACHE (in-memory, per session)
     ---------------------------------------------------------
     structure:
     OPENING_CACHE[matchId][market][book] = openingOdd
  ========================================================= */

  const OPENING_CACHE = Object.create(null);

  function onSafe(ev, fn) {
    if (typeof window.on === "function") window.on(ev, fn);
    else document.addEventListener(ev, e => fn(e.detail));
  }

  function emitSafe(ev, data) {
    if (typeof window.emit === "function") window.emit(ev, data);
    else document.dispatchEvent(new CustomEvent(ev, { detail: data }));
  }

  function ensureOpening(matchId, market, book, value) {
    if (!OPENING_CACHE[matchId]) OPENING_CACHE[matchId] = {};
    if (!OPENING_CACHE[matchId][market]) OPENING_CACHE[matchId][market] = {};

    if (OPENING_CACHE[matchId][market][book] == null) {
      OPENING_CACHE[matchId][market][book] = value;
    }

    return OPENING_CACHE[matchId][market][book];
  }

  function enrichMarkets(matchId, markets) {
    if (!markets) return markets;

    Object.keys(markets).forEach(marketKey => {
      const groups = markets[marketKey];
      if (!groups) return;

      Object.keys(groups).forEach(groupKey => {
        const rows = groups[groupKey];
        if (!Array.isArray(rows)) return;

        rows.forEach(row => {
          const book = row.book;
          const current = Number(row.current);

          if (!book || !isFinite(current)) return;

          const opening = ensureOpening(matchId, marketKey, book, current);

          row.open = opening;
          row.current = current;
          row.delta = Number((current - opening).toFixed(3));
        });
      });
    });

    return markets;
  }

  async function fetchCoreOdds(matchId) {
    try {
      const res = await fetch(
        `${WORKER_BASE}/odds/core?matchId=${encodeURIComponent(matchId)}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        console.warn("[CORE] odds not available", matchId);
        return;
      }

      const data = await res.json();
      if (!data || !data.matchId || !data.markets) {
        console.warn("[CORE] invalid odds payload", data);
        return;
      }

      // 🔒 ENRICH WITH OPENING / CURRENT / DELTA
      data.markets = enrichMarkets(data.matchId, data.markets);

      emitSafe("odds-snapshot:core", data);
    } catch (err) {
      console.error("[CORE] odds fetch failed", err);
    }
  }

  // =========================================================
  // SINGLE SOURCE OF TRUTH
  // =========================================================
  onSafe("match-selected", match => {
    if (!match || !match.id) return;
    fetchCoreOdds(match.id);
  });

})();
