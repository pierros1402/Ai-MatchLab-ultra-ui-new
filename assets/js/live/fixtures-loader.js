/* ============================================================
   js/live/fixtures-loader.js (STABLE v3.2 UNIFIED EVENTS)
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

// --------------------------------------------------
// DEBUG SWITCH (set true only when debugging)
// --------------------------------------------------
const LIVE_DEBUG = false;

// -------------------------------------
// SIGNAL DEDUPE CACHE (in-memory)
// -------------------------------------
const __AIML_SIGNAL_CACHE = new Map();
const __AIML_INTEL_FETCH_TS = new Map();

const __AIML_INTEL_REQUESTS = new Map();
const __AIML_INTEL_CACHE = new Map();

const AIML_INTEL_CACHE_TTL = 60000;
let __AIML_INTEL_CURSOR = 0;
const AIML_INTEL_BATCH = 2;
// key: matchId
// value: lastSignalSignature

function liveLog(...args)  { if (LIVE_DEBUG) console.log(...args); }
function liveWarn(...args) { if (LIVE_DEBUG) console.warn(...args); }

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

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  // wrap so external callers can’t break date
  const loadTodaySafe  = (d) => loadToday(d || todayISO());
  const loadActiveSafe = (d) => loadActive(d || todayISO());
  const loadLiveSafe   = (d) => loadLive(d || todayISO());

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

async function fetchMatchIntelSafe(matchId) {

  const id = String(matchId || "").trim();
  if (!id) return null;

  const now = Date.now();

  const cached = __AIML_INTEL_CACHE.get(id);
  if (cached && (now - cached.ts) < AIML_INTEL_CACHE_TTL) {
    return cached.data;
  }

  if (__AIML_INTEL_REQUESTS.has(id)) {
    return __AIML_INTEL_REQUESTS.get(id);
  }

  const p = fetch(
    `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel?id=${encodeURIComponent(id)}`,
    { cache: "no-store" }
  )
  .then(r => {
    if (!r.ok) return null;
    return r.json();
  })
  .then(data => {

    if (!data) return null;

    __AIML_INTEL_CACHE.set(id, {
      ts: Date.now(),
      data
    });

    return data;

  })
  .catch(e => {

    if (e?.name === "AbortError") return null;
    return null;

  })
  .finally(() => {

    __AIML_INTEL_REQUESTS.delete(id);

  });

  __AIML_INTEL_REQUESTS.set(id, p);
  return p;
}

  // -----------------------------
  // LIVE (REALTIME + FALLBACK)
  // -----------------------------
  async function loadLive(dateYmd) {
    // ✅ hard guarantee: never emit undefined date
    const ymd =
      (typeof dateYmd === "string" && dateYmd.length >= 10)
        ? dateYmd.slice(0, 10)
        : todayISO();

    if (!dateYmd) liveWarn("[LIVE] loadLive called with empty dateYmd -> using", ymd);

    // 1) REALTIME WORKER FIRST (no KV, edge cached)
    try {
      const liveRes = await fetch(
        "https://aimatchlab-live-worker.pierros1402.workers.dev/live",
        { cache: "no-store" }
      );

      if (liveRes.ok) {
        const liveData = await liveRes.json();
        const liveMatches = safeArray(liveData.matches);

        if (liveMatches.length) {
          const payload = { date: ymd, matches: liveMatches, total: liveMatches.length };

          window.__AIML_LAST_LIVE = payload;

          // Live panel listens via window.on/window.emit bus
          if (typeof window.emit === "function") {
            window.emit("live:update", payload);
          }

// -------------------------------------
// INTEL SIGNAL FETCH
// -------------------------------------
if (liveMatches.length) {

  const batch = liveMatches.slice(
    __AIML_INTEL_CURSOR,
    __AIML_INTEL_CURSOR + AIML_INTEL_BATCH
  );

  __AIML_INTEL_CURSOR += AIML_INTEL_BATCH;

  if (__AIML_INTEL_CURSOR >= liveMatches.length) {
    __AIML_INTEL_CURSOR = 0;
  }

  for (const m of batch) {

    const last = __AIML_INTEL_FETCH_TS.get(m.id) || 0;
    const now = Date.now();

    if (now - last < 120000) continue;

    __AIML_INTEL_FETCH_TS.set(m.id, now);

    fetchMatchIntelSafe(m.id)
      .then(data => {

        if (!data || !data.signals || !data.signals.length) return;

        const signature = JSON.stringify(data.signals);
        const prev = __AIML_SIGNAL_CACHE.get(m.id);

        if (prev !== signature) {

          __AIML_SIGNAL_CACHE.set(m.id, signature);

          window.dispatchEvent(
            new CustomEvent("intel:signal", {
              detail: {
                matchId: m.id,
                signals: data.signals
              }
            })
          );

        }

      })
      .catch(() => {});

  }

}
liveLog("[LIVE] realtime source", liveMatches.length);
return payload;
          
        }
      }
    } catch (err) {
      liveWarn("[LIVE] realtime worker failed", err);
    }

    // 2) FALLBACK → SNAPSHOT (KV pipeline)
    try {
      const base = getBaseUrl();

      const url =
        `${base}/fixtures-runtime?mode=active&date=${encodeURIComponent(ymd)}&_t=${nowTs()}&nocache=${Math.random()}`;

      const data = await fetchJson(url);
      const matches = safeArray(data.matches);

      // keep only live-ish statuses (schema-agnostic)
      const liveMatches = matches.filter(m => {

        const s =
          String(
            m?.status?.type?.name ||
            m?.status ||
            ""
          ).toUpperCase();

        return (
          s.includes("LIVE") ||
          s.includes("PROGRESS") ||
          s.includes("FIRST") ||
          s.includes("SECOND") ||
          s.includes("HALF") ||
          s.includes("EXTRA") 
        );
     });

      const payload = { date: ymd, matches: liveMatches, total: liveMatches.length };

      window.__AIML_LAST_LIVE = payload;

      if (typeof window.emit === "function") {
        window.emit("live:update", payload);
      }
// -------------------------------------
// INTEL SIGNAL FETCH (LIGHTWEIGHT)
// -------------------------------------
try {

  for (const m of liveMatches) {

    fetchMatchIntelSafe(m.id)
      .then(data => {

        if (!data?.signals?.length) return;

        const signature = JSON.stringify(data.signals);
        const prev = __AIML_SIGNAL_CACHE.get(m.id);

        if (prev !== signature) {

          __AIML_SIGNAL_CACHE.set(m.id, signature);

          window.dispatchEvent(
            new CustomEvent("intel:signal", {
              detail: {
                matchId: m.id,
                signals: data.signals
              }
            })
          );

        }

      })
      .catch(()=>{});
  }

} catch (_) {}
      liveLog("[LIVE] fallback snapshot", liveMatches.length);
      return payload;

    } catch (err) {
      // keep this as real warning (rare + important)
      console.warn("[LIVE] snapshot fallback failed", err);

      const payload = { date: ymd, matches: [], total: 0 };
      window.__AIML_LAST_LIVE = payload;

      if (typeof window.emit === "function") {
        window.emit("live:update", payload);
      }

      return payload;
    }
  }

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
        // rare + important
        console.warn("[live-loop]", e);
      }
    }

    tick();
    setInterval(tick, 15000);
  })();

})();
