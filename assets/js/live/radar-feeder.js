/* =========================================================
   RADAR FEEDER — PRODUCTION SAFE
   Role:
   - Triggered by market-selected
   - Fetch latest odds events (per market)
   - Emit ONE strongest delta per match
   - No demo, no KV writes
========================================================= */

(function () {
  const ENDPOINT = "/api/odds-events";
  // Expected response:
  // { items: [{ matchId, home, away, market, book, delta, ts }] }

  let lastMarket = null;
  let inFlight = false;

  if (!window.on || !window.emit) return;

  // -------------------------------------------------------
  // Main listener
  // -------------------------------------------------------
  window.on("market-selected", async function (payload) {
    const market = payload && payload.market;
    if (!market || market === lastMarket || inFlight) return;

    lastMarket = market;
    inFlight = true;

    try {
      const res = await fetch(
        ENDPOINT + "?market=" + encodeURIComponent(market),
        { headers: { "Accept": "application/json" } }
      );

      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];

      // Keep 1 strongest |delta| per match
      const byMatch = new Map();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it || !it.matchId || typeof it.delta !== "number") continue;

        const prev = byMatch.get(it.matchId);
        if (!prev || Math.abs(it.delta) > Math.abs(prev.delta)) {
          byMatch.set(it.matchId, it);
        }
      }

      const result = Array.from(byMatch.values())
        .sort(function (a, b) {
          return Math.abs(b.delta) - Math.abs(a.delta);
        })
        .slice(0, 20);

      window.emit("radar:update", {
        market: market,
        items: result,
        updatedAt: Date.now()
      });

    } catch (err) {
      console.warn("[radar-feeder] error", err);
      window.emit("radar:update", {
        market: market,
        items: [],
        error: true
      });
    } finally {
      inFlight = false;
    }
  });

  // -------------------------------------------------------
  // Catch-up for late subscriber (IMPORTANT)
  // -------------------------------------------------------
  if (window.AIML_LAST_MARKET) {
    window.emit("market-selected", {
      market: window.AIML_LAST_MARKET,
      source: "radar-feeder:catchup"
    });
  }

})();
