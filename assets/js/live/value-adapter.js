/* ==========================================================================
   VALUE ADAPTER (Worker -> UI Event Bus)
   Path: assets/js/live/value-adapter.js

   - Fetches /value-picks from aimatchlab-main-worker
   - Worker returns: { ok, date, total, items: [...] }
   - UI expects:     { ok, date, total, picks: [...] }
   - Emits: value:update
   ========================================================================== */

(function () {
  "use strict";

  const log = (...a) => console.log("[value-adapter]", ...a);
  const warn = (...a) => console.warn("[value-adapter]", ...a);

  // --------------------------------------------------------------------------
  // CONFIG
  // --------------------------------------------------------------------------
  // Priority:
  // 1) window.AIML_VALUE_CFG.valueBase
  // 2) window.AIML_API_BASE
  // 3) same-origin relative
  const CFG = window.AIML_VALUE_CFG || {};
  const API_BASE = CFG.valueBase || window.AIML_API_BASE || "";

  function getTodayYYYYMMDD() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function endpoint(date) {
    if (!date) return `${API_BASE}/value-picks`;
    return `${API_BASE}/value-picks?date=${encodeURIComponent(date)}`;
  }

  function normalize(raw) {
    const ok = !!(raw && raw.ok);
    const date = raw?.date || getTodayYYYYMMDD();

    // ✅ Worker returns items[]
    // UI renderer should work with picks[]
    const picks = Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.picks)
        ? raw.picks
        : [];

    return {
      ok,
      date,
      total: typeof raw?.total === "number" ? raw.total : picks.length,
      source: raw?.source || "VALUE",
      engine: raw?.items?.[0]?.engine || raw?.engine || null,
      build: raw?.items?.[0]?.build || raw?.build || null,
      picks
    };
  }

  async function fetchValue(date) {
    const url = endpoint(date);
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();
    return normalize(data);
  }

  async function refresh(date) {
    const targetDate = date || getTodayYYYYMMDD();

    try {
      const payload = await fetchValue(targetDate);

      if (typeof window.emit === "function") {
        window.emit("value:update", payload);
      } else {
        warn("window.emit not found (app.js not loaded?)");
      }

      log("update", payload.date, "picks=", payload.picks.length);
    } catch (err) {
      warn("fetch error", err);

      const payload = {
        ok: false,
        date: targetDate,
        total: 0,
        source: "VALUE",
        picks: []
      };

      if (typeof window.emit === "function") {
        window.emit("value:update", payload);
      }
    }
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------------------------

  // 1) Run once on startup
  setTimeout(() => refresh(getTodayYYYYMMDD()), 0);

  // 2) Refresh after Today matches load (same day)
  if (typeof window.on === "function") {
    window.on("today-matches:loaded", (p) => {
      const d = p?.date || getTodayYYYYMMDD();
      refresh(d);
    });
  }

  // 3) Debug helper (manual refresh from console)
  window.AIML_REFRESH_VALUE = (date) => refresh(date);

})();
