/* ============================================================
   js/live/fixtures-loader.js (STABLE v2.2)
   - Fetches /fixtures-runtime from AIMATCHLAB API Worker
   - Emits:
       "today-matches:loaded"   { date, matches, total }
       "active-leagues:updated" { date, matches, total }
       "live:updated"           { matches, total }
   - Also stores last payloads for debugging/UI reuse:
       window.__AIML_LAST_TODAY
       window.__AIML_LAST_ACTIVE
       window.__AIML_LAST_LIVE
============================================================ */

(function () {
  "use strict";

  function nowTs() { return Date.now(); }

  function getBaseUrl() {
    // Preferred: global config (set by app.js)
    if (window.AIML_CONFIG && typeof window.AIML_CONFIG.BASE_URL === "string") {
      return window.AIML_CONFIG.BASE_URL.replace(/\/+$/, "");
    }
    // Fallback: UI live cfg (some builds use this)
    if (window.AIML_LIVE_CFG && typeof window.AIML_LIVE_CFG.fixturesBase === "string") {
      return window.AIML_LIVE_CFG.fixturesBase.replace(/\/+$/, "");
    }
    // Hard fallback
    return "https://aimatchlab-api.pierros1402.workers.dev";
  }

  async function fetchJson(url) {
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText} :: ${t.slice(0, 200)}`);
    }
    return await r.json();
  }

  // -----------------------------
  // Public: load today / active / live
  // -----------------------------
  async function loadToday(dateYmd) {
    const base = getBaseUrl();
    const url = `${base}/fixtures-runtime?mode=today&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}`;
    const data = await fetchJson(url);

    // Normalize shape defensively
    const payload = {
      date: data.date || dateYmd,
      matches: Array.isArray(data.matches) ? data.matches : [],
      total: Number.isFinite(data.total) ? data.total : (Array.isArray(data.matches) ? data.matches.length : 0)
    };

    window.__AIML_LAST_TODAY = payload;

    if (typeof window.emit === "function") {
      window.emit("today-matches:loaded", payload);
    }
    document.dispatchEvent(
      new CustomEvent("today-matches:loaded", {
        detail: payload
      })
    );

    return payload;
  }
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

  // 1️⃣ Bus system (κρατάμε για συμβατότητα)
    if (typeof window.emit === "function") {
      window.emit("active-leagues:updated", payload);
    }

  // 2️⃣ DOM CustomEvent (ΑΥΤΟ χρειάζεται το panel)
    document.dispatchEvent(
      new CustomEvent("active-leagues:updated", {
        detail: payload
      })
    );

    return payload;
  }

  async function loadLive() {
    const base = getBaseUrl();
    const url = `${base}/fixtures-runtime?mode=live&_t=${nowTs()}`;
    const data = await fetchJson(url);

    const payload = {
      matches: Array.isArray(data.matches) ? data.matches : [],
      total: Number.isFinite(data.total) ? data.total : (Array.isArray(data.matches) ? data.matches.length : 0)
    };

    window.__AIML_LAST_LIVE = payload;

    if (typeof window.emit === "function") {
      window.emit("live:updated", payload);
    }
    return payload;
  }

  // -----------------------------
  // Backward-compat wrapper names
  // -----------------------------
  window.AIML_FixturesLoader = window.AIML_FixturesLoader || {};
  window.AIML_FixturesLoader.loadToday = loadToday;
  window.AIML_FixturesLoader.loadActive = loadActive;
  window.AIML_FixturesLoader.loadLive = loadLive;

  // Some older panels call these:
  window.loadTodayFixtures = loadToday;
  window.loadActiveFixtures = loadActive;
  window.loadLiveFixtures = loadLive;

})();
