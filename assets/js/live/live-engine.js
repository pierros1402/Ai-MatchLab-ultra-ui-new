// assets/js/live/live-engine.js
(function () {
  if (window.__AIML_LIVE_ENGINE__) return;
  window.__AIML_LIVE_ENGINE__ = true;

  const LIVE_URL =
    "https://aimatchlab-api.pierros1402.workers.dev/fixtures-runtime?mode=live";


  const POLL_MS = 15000;

  async function fetchLive() {
    try {
      const res = await fetch(LIVE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const json = await res.json();
      const all = Array.isArray(json.matches) ? json.matches : [];

      // μόνο LIVE (όχι FT)
      const liveMatches = all.filter(
        m => m.status === "LIVE" || m.completed === false
      );

      window.emit("live:update", {
        ts: Date.now(),
        matches: liveMatches
      });

    } catch (err) {
      console.error("[live-engine] fetch failed", err);
      window.emit("live:update", { matches: [] });
    }
  }

  // start
  fetchLive();
  setInterval(fetchLive, POLL_MS);
})();
