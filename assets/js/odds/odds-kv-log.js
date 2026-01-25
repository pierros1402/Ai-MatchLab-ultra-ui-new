(function () {
  "use strict";

  function on(ev, fn) {
    if (window.on) return window.on(ev, fn);
    window.addEventListener(ev, e => fn(e.detail));
  }

  const BASE = "https://aimatchlab-main-worker.pierros1402.workers.dev";

  on("match-selected", async (match) => {
    if (!match || !match.id) return;
    try {
      const r = await fetch(`${BASE}/odds/core?matchId=${encodeURIComponent(match.id)}`);
      const j = await r.json();
      console.log("[ODDS-LOG]", j);
    } catch (e) {
      console.error("[ODDS-LOG] error", e);
    }
  });
})();
