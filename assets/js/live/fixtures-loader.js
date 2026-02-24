/* ============================================================
   js/live/fixtures-loader.js (STABLE v3.1 UNIFIED EVENTS)
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

  function safeArray(x) { return Array.isArray(x) ? x : []; }

  // -----------------------------
  // TODAY (SNAPSHOT)
  // -----------------------------
  async function loadToday(dateYmd) {
    const base = getBaseUrl();

    const url =
      `${base}/fixtures-runtime?mode=today&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}&nocache=${Math.random()}`;

    const data = await fetchJson(url);

    const matches = safeArray(data.matches);

    const payload = {
      date: data.date || dateYmd,
      matches,
      total: Number.isFinite(data.total) ? data.total : matches.length
    };

    window.__AIML_LAST_TODAY = payload;

    // UI panels listen with DOM events
    document.dispatchEvent(
      new CustomEvent("today-matches:loaded", { detail: payload })
    );

    return payload;
  }

  // -----------------------------
  // ACTIVE (SNAPSHOT)
  // -----------------------------
  async function loadActive(dateYmd) {
    const base = getBaseUrl();

    const url =
      `${base}/fixtures-runtime?mode=active&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}&nocache=${Math.random()}`;

    const data = await fetchJson(url);

    const matches = safeArray(data.matches);

    const payload = {
      date: data.date || dateYmd,
      matches,
      total: Number.isFinite(data.total) ? data.total : matches.length
    };

    window.__AIML_LAST_ACTIVE = payload;

    document.dispatchEvent(
      new CustomEvent("active-leagues:updated", { detail: payload })
    );

    return payload;
  }

  // -----------------------------
  // LIVE (REALTIME + FALLBACK)
  // -----------------------------
  async function loadLive(dateYmd) {
    // ✅ hard guarantee: never emit undefined date
    const ymd =
      (typeof dateYmd === "string" && dateYmd.length >= 10)
        ? dateYmd.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    if (!dateYmd) console.warn("[LIVE] loadLive called with empty dateYmd -> using", ymd);

    // 1) REALTIME WORKER FIRST (no KV, edge cached)
    try {
      const liveRes = await fetch(
        "https://aimatchlab-live-worker.pierros1402.workers.dev/live",
        { cache: "no-store" }
      );

      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const liveMatches = safeArray(liveData.matches);

        if (liveMatches.length > 0) {
          const payload = { date: ymd, matches: liveMatches, total: liveMatches.length };

          window.__AIML_LAST_LIVE = payload;

          // Live panel listens via window.on/window.emit bus
          if (typeof window.emit === "function") {
            window.emit("live:update", payload);
          }

          console.log("[LIVE] realtime source", liveMatches.length);
          return payload;
        }
      }
    } catch (err) {
      console.warn("[LIVE] realtime worker failed", err);
    }

    // 2) FALLBACK → SNAPSHOT (KV pipeline)
    try {
      const base = getBaseUrl();

      const url =
        `${base}/fixtures-runtime?mode=active&date=${encodeURIComponent(ymd)}&_t=${nowTs()}&nocache=${Math.random()}`;

      const data = await fetchJson(url);
      const matches = safeArray(data.matches);

      // keep only live-ish statuses if your snapshot includes scheduled too
      const liveMatches = matches.filter(m => {
        const s = String(
          m?.status ??
          m?.status?.type?.state ??
          m?.status?.type?.name ??
          ""
        ).toUpperCase();

        return (
          s.includes("LIVE") ||
          s.includes("IN_PROGRESS") ||
          s.includes("FIRST_HALF") ||
          s.includes("SECOND_HALF") ||
          s.includes("HALF_TIME") ||
          s.includes("EXTRA_TIME")
        );
      });

      const payload = { date: ymd, matches: liveMatches, total: liveMatches.length };

      window.__AIML_LAST_LIVE = payload;

      if (typeof window.emit === "function") {
        window.emit("live:update", payload);
      }

      console.log("[LIVE] fallback snapshot", liveMatches.length);
      return payload;

    } catch (err) {
      console.warn("[LIVE] snapshot fallback failed", err);

      const payload = { date: ymd, matches: [], total: 0 };
      window.__AIML_LAST_LIVE = payload;

      if (typeof window.emit === "function") {
        window.emit("live:update", payload);
      }

      return payload;
    }
  }
     function todayISO() {
       const d = new Date();
       return d.toISOString().slice(0, 10);
     }

// wrap so external callers can’t break date
      const loadTodaySafe  = (d) => loadToday(d || todayISO());
      const loadActiveSafe = (d) => loadActive(d || todayISO());
      const loadLiveSafe   = (d) => loadLive(d || todayISO());
  // -----------------------------
  // PUBLIC API
  // -----------------------------
  window.AIML_FixturesLoader = window.AIML_FixturesLoader || {};
  window.AIML_FixturesLoader.loadToday = loadTodaySafe;
  window.AIML_FixturesLoader.loadActive = loadActiveSafe;
  window.AIML_FixturesLoader.loadLive = loadLiveSafe;

  window.loadTodayFixtures = loadTodaySafe;
  window.loadActiveFixtures = loadActiveSafe;
  window.loadLiveFixtures = loadLiveSafe;

  // --------------------------------------------------
  // LIVE AUTO POLLER (required for live panel)
  // --------------------------------------------------
  (function startLiveLoop() {
     async function tick() {
       try {
         await loadLive(todayISO());
       } catch (e) {
         console.warn("[live-loop]", e);
       }
     }

     tick();
     setInterval(tick, 15000);
   })();

})();