/* =========================================================
   AIML – FIXTURES LOADER (RUNTIME – SPLIT TODAY / ACTIVE)
   - TODAY: time-based dataset
   - ACTIVE: full-day dataset (no FT expiry)
========================================================= */

(function () {
  "use strict";

  if (typeof window.emit !== "function") {
    console.warn("[fixtures-loader] event bus not ready");
    return;
  }

  const cfg = window.AIML_LIVE_CFG || {};
  const base = window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL
    ? window.AIML_CONFIG.BASE_URL
    : cfg.fixturesBase;

  if (!base) {
    console.warn("[fixtures-loader] missing AIML_LIVE_CFG.fixturesBase");
    return;
  }

  const POLL_INTERVAL = 30000;
  let busy = false;

  function safeArr(x) {
    return Array.isArray(x) ? x : [];
  }

  async function fetchRuntime(mode) {
    const selectedDate =
      window.__AIML_SELECTED_DATE__ ||
      new Date().toISOString().slice(0, 10);

    const url =
      base +
      "/fixtures-runtime" +
      `?mode=${encodeURIComponent(mode)}` +
      `&date=${encodeURIComponent(selectedDate)}` +
      `&_t=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("runtime fetch failed: " + res.status);
    return res.json();
  }

  function emitToday(data) {
    const matches = safeArr(data?.matches);
    const date = data?.date;

    const payload = {
      source: "fixtures-runtime",
      date,
      matches
    };

    window.__AIML_LAST_TODAY__ = payload;

    window.emit("today-matches:loaded", payload);
    window.emit("today:updated", matches);
  }

  function emitActive(data) {
    const matches = safeArr(data?.matches);
    window.emit("active-leagues:updated", matches);
  }

  async function loadAll() {
    if (busy) return;
    busy = true;

    try {

      // TODAY (time-based view)
      const today = await fetchRuntime("today");
      emitToday(today);

      // ACTIVE (full-day view)
      const active = await fetchRuntime("active");
      emitActive(active);

    } catch (err) {
      console.warn("[fixtures-loader] runtime error", err);
    } finally {
      busy = false;
    }
  }

  loadAll();
  setInterval(loadAll, POLL_INTERVAL);

})();