/* ============================================================
   js/live/fixtures-loader.js (STABLE v3.0 UNIFIED EVENTS)
   - Unified event model
   - Emits:
       "today-matches:loaded"
       "active-leagues:updated"
       "live:update"              (UNIFIED)
   - Stores debug payloads:
       window.__AIML_LAST_TODAY
       window.__AIML_LAST_ACTIVE
       window.__AIML_LAST_LIVE
============================================================ */

(function () {
  "use strict";

  function nowTs() { return Date.now(); }

  function getBaseUrl() {
    if (window.AIML_CONFIG && typeof window.AIML_CONFIG.BASE_URL === "string") {
      return window.AIML_CONFIG.BASE_URL.replace(/\/+$/, "");
    }
    if (window.AIML_LIVE_CFG && typeof window.AIML_LIVE_CFG.fixturesBase === "string") {
      return window.AIML_LIVE_CFG.fixturesBase.replace(/\/+$/, "");
    }
    return "https://aimatchlab-api.pierros1402.workers.dev";
  }

  async function fetchJson(url) {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText} :: ${t.slice(0, 200)}`);
    }
    return await r.json();
  }

  // -----------------------------
  // TODAY
  // -----------------------------
  async function loadToday(dateYmd) {
    const base = getBaseUrl();
    const url = `${base}/fixtures-runtime?mode=today&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}`;
    const data = await fetchJson(url);

    const payload = {
      date: data.date || dateYmd,
      matches: Array.isArray(data.matches) ? data.matches : [],
      total: Number.isFinite(data.total)
        ? data.total
        : (Array.isArray(data.matches) ? data.matches.length : 0)
    };

    window.__AIML_LAST_TODAY = payload;

    if (typeof window.emit === "function") {
      window.emit("today-matches:loaded", payload);
      window.emit("live:update", payload); // UNIFIED
    }

    document.dispatchEvent(
      new CustomEvent("today-matches:loaded", { detail: payload })
    );

    return payload;
  }

  // -----------------------------
  // ACTIVE
  // -----------------------------
  async function loadActive(dateYmd) {
    const base = getBaseUrl();
    const url = `${base}/fixtures-runtime?mode=active&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}`;
    const data = await fetchJson(url);

    const payload = {
      date: data.date || dateYmd,
      matches: Array.isArray(data.matches) ? data.matches : [],
      total: Number.isFinite(data.total)
        ? data.total
        : (Array.isArray(data.matches) ? data.matches.length : 0)
    };

    window.__AIML_LAST_ACTIVE = payload;

    if (typeof window.emit === "function") {
      window.emit("active-leagues:updated", payload);
    }

    document.dispatchEvent(
      new CustomEvent("active-leagues:updated", { detail: payload })
    );

    return payload;
  }

  // -----------------------------
  // LIVE (DEDICATED ENDPOINT)
  // -----------------------------
  async function loadLive() {
    const base = getBaseUrl();
    const url = `${base}/fixtures-runtime?mode=live&_t=${nowTs()}`;
    const data = await fetchJson(url);

    const payload = {
      matches: Array.isArray(data.matches) ? data.matches : [],
      total: Number.isFinite(data.total)
        ? data.total
        : (Array.isArray(data.matches) ? data.matches.length : 0)
    };

    window.__AIML_LAST_LIVE = payload;

    if (typeof window.emit === "function") {
      window.emit("live:update", payload); // UNIFIED EVENT
    }

    return payload;
  }

  // -----------------------------
  // PUBLIC API
  // -----------------------------
  window.AIML_FixturesLoader = window.AIML_FixturesLoader || {};
  window.AIML_FixturesLoader.loadToday = loadToday;
  window.AIML_FixturesLoader.loadActive = loadActive;
  window.AIML_FixturesLoader.loadLive = loadLive;

  // Backward compatibility
  window.loadTodayFixtures = loadToday;
  window.loadActiveFixtures = loadActive;
  window.loadLiveFixtures = loadLive;

})();