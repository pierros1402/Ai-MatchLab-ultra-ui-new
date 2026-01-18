/**
 * LIVE ENGINE — WORKER-DRIVEN (NORMALIZED)
 *
 * Purpose:
 * - Fetch LIVE matches from live-matches-worker
 * - Normalize league name (competition, όχι stages)
 * - Emit live:update for right panels
 * - No dependency on Today
 * - No KV
 */

(function () {
  if (window.__LIVE_ENGINE_STARTED__) return;
  window.__LIVE_ENGINE_STARTED__ = true;

  const LIVE_WORKER_URL =
    window.AIML_LIVE_WORKER_URL ||
    "https://live-matches-worker.pierros1402.workers.dev/api/unified-live";

  const POLL_MS = 60_000; // 60s

  let timer = null;

  function normalizeMatch(m) {
    // Παίρνουμε ΜΟΝΟ competition ως league
    const leagueName =
      m.competition?.name ||
      m.leagueName ||
      m.league ||
      "";

    return {
      ...m,
      leagueName
    };
  }

  async function fetchLive() {
    try {
      const res = await fetch(LIVE_WORKER_URL, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      if (!data || !Array.isArray(data.matches)) return;

      const normalized = data.matches.map(normalizeMatch);

      emit("live:update", {
        source: "worker",
        matches: normalized
      });
    } catch (err) {
      // σιωπηλό fail – LIVE δεν πρέπει να σπάει UI
    }
  }

  function start() {
    fetchLive();
    timer = setInterval(fetchLive, POLL_MS);
  }

  if (document.readyState === "complete") {
    start();
  } else {
    window.addEventListener("load", start);
  }
})();
