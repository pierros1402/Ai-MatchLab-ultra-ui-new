// =====================================================
// ODDS ENGINE (PRODUCTION)
// Emits: odds-snapshot:canonical
// Depends on: app.js (window.on / window.emit)
// =====================================================

(function () {
  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[odds-engine] event bus not ready");
    return;
  }

  let ACTIVE_MATCH_ID = null;
  let ACTIVE_MARKET = "1X2";

  // --------------------------------------------------
  // Track active match
  // --------------------------------------------------
  window.on("match-selected", m => {
    ACTIVE_MATCH_ID = m && m.id != null ? String(m.id) : null;
  });

  // --------------------------------------------------
  // Track active market
  // --------------------------------------------------
  window.on("market-selected", mkt => {
    if (typeof mkt === "string") {
      ACTIVE_MARKET = mkt;
    } else if (mkt && mkt.market) {
      ACTIVE_MARKET = mkt.market;
    }
  });

  // --------------------------------------------------
  // INPUT: normalized odds batch (REAL DATA)
  // This MUST already exist in your pipeline
  // --------------------------------------------------
  window.on("odds-normalized:batch", batch => {
    if (!batch || !Array.isArray(batch.items)) return;

    emitCanonical(batch);
  });

  // --------------------------------------------------
  // Canonical emitter
  // --------------------------------------------------
  function emitCanonical(batch) {
    const rows = [];

    batch.items.forEach(item => {
      if (!item.matchId) return;

      rows.push({
        matchId: String(item.matchId),
        market: item.market || ACTIVE_MARKET || "1X2",
        book: item.book,
        bookGroup: item.bookGroup || "eu",
        open: item.open,
        current: item.current,
        delta: item.delta
      });
    });

    if (!rows.length) return;

    window.emit("odds-snapshot:canonical", {
      ts: Date.now(),
      market: ACTIVE_MARKET,
      rows
    });
  }

})();
