// assets/js/live/live-engine.js
(function () {
  if (window.__AIML_LIVE_ENGINE__) return;
  window.__AIML_LIVE_ENGINE__ = true;

  const cfg = window.AIML_LIVE_CFG;
  if (!cfg || !cfg.liveBase || !cfg.livePath) {
    console.error("[live-engine] missing AIML_LIVE_CFG");
    return;
  }

  const LIVE_URL = cfg.liveBase + cfg.livePath;
  const POLL_MS = 15000;

  async function fetchLive() {
    try {
      const res = await fetch(LIVE_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const json = await res.json();
      const all = Array.isArray(json.matches) ? json.matches : [];

      // ΜΟΝΟ LIVE
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
