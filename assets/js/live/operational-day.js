/* operational-day.js
 * Single authority for the UI's operational day.
 *
 * The operational day is always the Europe/Athens calendar day. Published
 * snapshot availability is a separate readiness signal fetched from the engine.
 * Static UI files under data/ are deliberately NOT consulted, so a stale static
 * Render deploy can never pin the application to yesterday.
 */
(function () {
  "use strict";

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function athensDay() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const year = parts.find(part => part.type === "year")?.value;
      const month = parts.find(part => part.type === "month")?.value;
      const day = parts.find(part => part.type === "day")?.value;
      const value = `${year}-${month}-${day}`;
      return validDay(value) ? value : new Date().toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function apiBase() {
    const cfg = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
    const configured = String(cfg.BASE_URL || cfg.fixturesBase || "").trim();
    if (configured) return configured.replace(/\/+$/, "");

    const host = String(window.location?.hostname || "").toLowerCase();
    const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
    return local
      ? "http://localhost:3010"
      : "https://ai-matchlab-engine.onrender.com";
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    if (window.AIML && typeof window.AIML.emit === "function") {
      window.AIML.emit(name, detail);
    }
  }

  const state = {
    day: athensDay(),
    source: "europe-athens-calendar",
    engineSnapshotReady: null,
    engineSnapshotDay: null,
    engineSnapshotHash: null,
    engineLatestDay: null,
    engineLatestHash: null,
    checkedAt: null,
    error: null
  };

  window.__AIML_OPERATIONAL_DAY = state.day;

  let refreshInFlight = null;

  async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function refreshReadiness() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const previous = { ...state };
      const nextCalendarDay = athensDay();

      if (nextCalendarDay !== state.day) {
        state.day = nextCalendarDay;
        window.__AIML_OPERATIONAL_DAY = nextCalendarDay;
      }

      try {
        const base = apiBase();
        const cacheBust = Date.now();
        const [snapshot, latest] = await Promise.all([
          fetchJsonWithTimeout(
            `${base}/deploy-snapshot?date=${encodeURIComponent(state.day)}&_t=${cacheBust}`,
            10000
          ),
          fetchJsonWithTimeout(
            `${base}/deploy-snapshot/latest?_t=${cacheBust}`,
            10000
          ).catch(() => null)
        ]);

        const snapshotDay = String(snapshot?.date || snapshot?.dayKey || "").slice(0, 10);
        const snapshotHash = String(snapshot?.manifest?.hash || snapshot?.hash || "").toLowerCase();
        const latestDay = String(latest?.date || latest?.dayKey || "").slice(0, 10);
        const latestHash = String(latest?.hash || "").toLowerCase();

        state.engineSnapshotReady = Boolean(
          snapshot?.ok === true &&
          snapshotDay === state.day &&
          latestDay === state.day &&
          snapshotHash &&
          latestHash === snapshotHash
        );
        state.engineSnapshotDay = validDay(snapshotDay) ? snapshotDay : null;
        state.engineSnapshotHash = snapshotHash || null;
        state.engineLatestDay = validDay(latestDay) ? latestDay : null;
        state.engineLatestHash = latestHash || null;
        state.checkedAt = new Date().toISOString();
        state.error = null;
      } catch (error) {
        state.engineSnapshotReady = false;
        state.engineSnapshotDay = null;
        state.engineSnapshotHash = null;
        state.checkedAt = new Date().toISOString();
        state.error = String(error?.message || error);
      }

      const dayChanged = previous.day !== state.day;
      const readinessChanged =
        previous.engineSnapshotReady !== state.engineSnapshotReady ||
        previous.engineSnapshotDay !== state.engineSnapshotDay ||
        previous.engineSnapshotHash !== state.engineSnapshotHash ||
        previous.engineLatestDay !== state.engineLatestDay ||
        previous.engineLatestHash !== state.engineLatestHash ||
        previous.error !== state.error;

      if (dayChanged) {
        emit("operational-day:change", {
          previousDay: previous.day,
          day: state.day,
          state: { ...state }
        });
      }

      if (dayChanged || readinessChanged) {
        emit("operational-day:status", { ...state });
      }

      return { ...state };
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  }

  const api = {
    getDay: () => state.day,
    getState: () => ({ ...state }),
    refresh: refreshReadiness,
    ready: null
  };

  api.ready = refreshReadiness();
  window.AIML_OperationalDay = api;

  window.setInterval(() => {
    refreshReadiness().catch(() => {});
  }, 60000);
})();
