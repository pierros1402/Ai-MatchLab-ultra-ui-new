// =====================================================
// ODDS LOADER — FINAL (binds UI to aimatchlab-main)
// Source: GET /odds/core?matchId=XXX
// Emits: odds-snapshot:canonical
// =====================================================

(function () {
  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[odds-loader] event bus not ready");
    return;
  }

  const CFG = window.AIML_LIVE_CFG || {};
  const BASE = CFG.fixturesBase; // https://aimatchlab-main....workers.dev
  const PATH = "/odds/core";

  if (!BASE) {
    console.warn("[odds-loader] missing fixturesBase");
    return;
  }

  let ACTIVE_MATCH_ID = null;
  let IN_FLIGHT = false;

  // ---------------------------------------------
  // Listen for active match
  // ---------------------------------------------
  window.on("match-selected", m => {
    const id = m && m.id != null ? String(m.id) : null;
    if (!id) return;

    ACTIVE_MATCH_ID = id;
    fetchOddsForMatch(id);
  });

  // ---------------------------------------------
  // Fetch odds for selected match
  // ---------------------------------------------
  async function fetchOddsForMatch(matchId) {
    if (IN_FLIGHT) return;
    IN_FLIGHT = true;

    try {
      const url = `${BASE}${PATH}?matchId=${encodeURIComponent(matchId)}`;
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        console.warn("[odds-loader] fetch failed", res.status);
        return;
      }

      const json = await res.json();
      if (!json || !json.markets) {
        console.warn("[odds-loader] empty odds payload");
        return;
      }

      // Emit canonical snapshot expected by UI
      window.emit("odds-snapshot:canonical", {
        ts: Date.now(),
        market: "1X2",
        rows: flattenMarkets(matchId, json.markets)
      });

    } catch (err) {
      console.error("[odds-loader] error", err);
    } finally {
      IN_FLIGHT = false;
    }
  }

  // ---------------------------------------------
  // Normalize markets -> rows[]
  // ---------------------------------------------
  function flattenMarkets(matchId, markets) {
    const rows = [];

    Object.keys(markets || {}).forEach(market => {
      const groups = markets[market];
      if (!groups) return;

      Object.keys(groups).forEach(group => {
        const list = groups[group];
        if (!Array.isArray(list)) return;

        list.forEach(r => {
          rows.push({
            matchId,
            market,
            bookGroup: group,
            book: r.book,
            open: r.open ?? null,
            current: r.current ?? null,
            delta: r.delta ?? null
          });
        });
      });
    });

    return rows;
  }

})();
