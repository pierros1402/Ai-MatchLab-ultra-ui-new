(function () {
  "use strict";

  function on(ev, fn) {
    if (window.on) return window.on(ev, fn);
    window.addEventListener(ev, e => fn(e.detail));
  }

  function emit(ev, payload) {
    if (window.emit) return window.emit(ev, payload);
    window.dispatchEvent(new CustomEvent(ev, { detail: payload }));
  }

  // ✅ ΣΩΣΤΟΣ WORKER
  const BASE = "https://aimatchlab-api.pierros1402.workers.dev";

  on("match-selected", async (match) => {
    if (!match || !match.id) return;

    try {
      const today = new Date().toISOString().slice(0, 10);

      const r = await fetch(
        `${BASE}/api/odds?matchId=${encodeURIComponent(match.id)}&date=${today}&market=1X2`
      );

      if (!r.ok) {
        console.error("[ODDS] HTTP error", r.status);
        return;
      }

      const j = await r.json();

      if (!j || !j.ok) return;

      emit("odds-snapshot:core", {
        matchId: match.id,
        market: j.market,
        snapshot: j.snapshot
      });

    } catch (e) {
      console.error("[ODDS] error", e);
    }
  });
})();
