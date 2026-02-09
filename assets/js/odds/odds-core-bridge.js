(function () {
  "use strict";

  if (window.__AIML_ODDS_CORE_BRIDGE__) return;
  window.__AIML_ODDS_CORE_BRIDGE__ = true;

  // ✅ ΣΩΣΤΟΣ WORKER
  const WORKER_BASE = "https://aimatchlab-api.pierros1402.workers.dev";

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

  function enrichSnapshot(matchId, market, snapshot) {
    if (!snapshot) return snapshot;

    Object.keys(snapshot).forEach(book => {
      const rows = snapshot[book];
      if (!Array.isArray(rows)) return;

      rows.forEach(row => {
        const current = Number(row.current);
        if (!isFinite(current)) return;

        const opening = ensureOpening(matchId, market, book, current);

        row.open = opening;
        row.current = current;
        row.delta = Number((current - opening).toFixed(3));
      });
    });

    return snapshot;
  }

  async function fetchCoreOdds(matchId) {
    try {
      const today = new Date().toISOString().slice(0, 10);

      const res = await fetch(
        `${WORKER_BASE}/api/odds?matchId=${encodeURIComponent(matchId)}&date=${today}&market=1X2`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        console.warn("[CORE] odds not available", matchId);
        return;
      }

      const data = await res.json();
      if (!data || !data.ok) {
        console.warn("[CORE] invalid odds payload", data);
        return;
      }

      const enriched = enrichSnapshot(
        matchId,
        data.market,
        data.snapshot
      );

      emitSafe("odds-snapshot:core", {
        matchId: matchId,
        market: data.market,
        snapshot: enriched
      });

    } catch (err) {
      console.error("[CORE] odds fetch failed", err);
    }
  }

  onSafe("match-selected", match => {
    if (!match || !match.id) return;
    fetchCoreOdds(match.id);
  });

})();
