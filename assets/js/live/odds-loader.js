// =====================================================
// ODDS LOADER — FINAL (API v2 compatible)
// Source: GET /odds?matchId=XXX&date=YYYY-MM-DD&market=1X2
// Emits: odds-snapshot:canonical
// =====================================================

(function () {
  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[odds-loader] event bus not ready");
    return;
  }

  const CFG = window.AIML_LIVE_CFG || {};
  const BASE =
    (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
      ? window.AIML_CONFIG.BASE_URL
      : CFG.fixturesBase;

  const PATH = "/odds";   // ✅ ΧΩΡΙΣ trailing slash

  if (!BASE) {
    console.warn("[odds-loader] missing BASE_URL");
    return;
  }

  let IN_FLIGHT = false;

  // --------------------------------------------------
  // Listen for active match
  // --------------------------------------------------
  window.on("match-selected", m => {
    const id = m && m.id != null ? String(m.id) : null;
    if (!id) return;
    fetchOddsForMatch(id);
  });

  // --------------------------------------------------
  // Fetch odds for selected match
  // --------------------------------------------------
  async function fetchOddsForMatch(matchId) {
    if (IN_FLIGHT) return;
    IN_FLIGHT = true;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const url =
        `${BASE}${PATH}` +
        `?matchId=${encodeURIComponent(matchId)}` +
        `&date=${today}` +
        `&market=1X2`;

      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        console.warn("[odds-loader] fetch failed", res.status);
        return;
      }

      const json = await res.json();

      if (!json || !json.snapshot) {
        console.warn("[odds-loader] empty odds snapshot");
        return;
      }

      window.emit("odds-snapshot:core", {
        matchId,
        snapshot: json.snapshot
      });

    } catch (err) {
      console.error("[odds-loader] error", err);
    } finally {
      IN_FLIGHT = false;
    }
  }

})();
