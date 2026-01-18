// =====================================================
// CANONICAL SNAPSHOT → CORE SNAPSHOT (ACTIVE MATCH SAFE)
// =====================================================

(function () {
  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[odds-core] event bus not ready");
    return;
  }

  let ACTIVE_MATCH_ID = null;
  let LAST_CANONICAL_SNAPSHOT = null;

  // --------------------------------------------------
  // Track active match
  // --------------------------------------------------
  window.on("match-selected", m => {
    ACTIVE_MATCH_ID = m && m.id != null ? String(m.id) : null;

    // replay last canonical snapshot when match becomes active
    if (ACTIVE_MATCH_ID && LAST_CANONICAL_SNAPSHOT) {
      processCanonical(LAST_CANONICAL_SNAPSHOT);
    }
  });

  // --------------------------------------------------
  // Canonical snapshot listener
  // --------------------------------------------------
  window.on("odds-snapshot:canonical", snap => {
    if (!snap || !Array.isArray(snap.rows)) return;
    LAST_CANONICAL_SNAPSHOT = snap;
    processCanonical(snap);
  });

  // --------------------------------------------------
  // Core processor
  // --------------------------------------------------
  function processCanonical(snap) {
    if (!ACTIVE_MATCH_ID) {
      window.emit("odds-snapshot:core", {
        matchId: null,
        markets: {}
      });
      return;
    }

    const rows = snap.rows.filter(r =>
      String(r.matchId) === ACTIVE_MATCH_ID
    );

    if (!rows.length) {
      window.emit("odds-snapshot:core", {
        matchId: ACTIVE_MATCH_ID,
        markets: {}
      });
      return;
    }

    const markets = {};

    rows.forEach(r => {
      const mk = r.market || snap.market || "1X2";

      if (!markets[mk]) {
        markets[mk] = {
          greek: [],
          eu: [],
          asian: [],
          betfair: []
        };
      }

      const group =
        r.bookGroup === "greek"   ? "greek"   :
        r.bookGroup === "asian"   ? "asian"   :
        r.bookGroup === "betfair" ? "betfair" :
                                   "eu";

      markets[mk][group].push({
        book: r.book,
        open: r.open,
        current: r.current,
        delta: r.delta
      });
    });

    window.emit("odds-snapshot:core", {
      matchId: ACTIVE_MATCH_ID,
      markets
    });
  }

})();
