/* operational-day.js
 * Atomic publication authority for the UI day.
 *
 * calendarDay = Europe/Athens calendar date.
 * day         = newest VERIFIED published release that is not in the future.
 *
 * The UI must never advance merely because the clock crossed midnight. A new
 * calendar day becomes the operational day only after the engine exposes a
 * complete date snapshot and the authoritative latest pointer proves that the
 * release has been promoted. If publication is late or broken, the UI keeps the
 * last verified release instead of rendering a half-built day / N/A Value plans.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "aiml.atomicPublishedDay.v1";

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function compareDay(a, b) {
    return String(a || "").localeCompare(String(b || ""));
  }

  function addDays(ymd, amount) {
    if (!validDay(ymd)) return null;
    const ms = Date.parse(`${ymd}T12:00:00Z`);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms + amount * 86400000).toISOString().slice(0, 10);
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

  function initialSafeDay(calendarDay) {
    try {
      const stored = window.localStorage?.getItem?.(STORAGE_KEY);
      if (
        validDay(stored) &&
        compareDay(stored, calendarDay) <= 0
      ) {
        return stored;
      }
    } catch (_) {}

    // On a cold browser start we deliberately begin one day behind until the
    // engine proves the current release. This is fail-closed and normally lasts
    // only for the first readiness request.
    return addDays(calendarDay, -1) || calendarDay;
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

  function snapshotMeta(snapshot) {
    const day = String(snapshot?.date || snapshot?.dayKey || "").slice(0, 10);
    const manifest = snapshot?.manifest && typeof snapshot.manifest === "object"
      ? snapshot.manifest
      : null;
    const hash = String(manifest?.hash || snapshot?.hash || "").toLowerCase();

    return {
      ok: Boolean(snapshot?.ok === true && validDay(day) && hash),
      day: validDay(day) ? day : null,
      hash: hash || null
    };
  }

  function latestMeta(latest) {
    const day = String(latest?.date || latest?.dayKey || "").slice(0, 10);
    const hash = String(latest?.hash || "").toLowerCase();
    return {
      ok: Boolean(latest?.ok === true && validDay(day) && hash),
      day: validDay(day) ? day : null,
      hash: hash || null
    };
  }

  function releaseMatchesLatest(snapshot, latest, day) {
    if (!snapshot?.ok || snapshot.day !== day) return false;
    if (!latest?.ok || !latest.day) return false;

    // A future pre-published release is allowed before midnight. It must not
    // force the UI into the future, but it also must not make today's already
    // verified snapshot look stale merely because latest now points to tomorrow.
    if (compareDay(latest.day, day) > 0) return true;

    return latest.day === day && latest.hash === snapshot.hash;
  }

  function rememberPublishedDay(day) {
    if (!validDay(day)) return;
    try {
      window.localStorage?.setItem?.(STORAGE_KEY, day);
    } catch (_) {}
  }

  const calendarDay = athensDay();
  const state = {
    day: initialSafeDay(calendarDay),
    calendarDay,
    publishedDay: null,
    source: "atomic-published-release",
    engineSnapshotReady: null,
    engineSnapshotDay: null,
    engineSnapshotHash: null,
    engineLatestDay: null,
    engineLatestHash: null,
    checkedAt: null,
    error: null
  };

  window.__AIML_OPERATIONAL_DAY = state.day;
  window.__AIML_CALENDAR_DAY = state.calendarDay;

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

  async function fetchSnapshot(base, day, cacheBust) {
    return fetchJsonWithTimeout(
      `${base}/deploy-snapshot?date=${encodeURIComponent(day)}&_t=${cacheBust}`,
      10000
    );
  }

  async function refreshReadiness() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      const previous = { ...state };
      const nextCalendarDay = athensDay();
      state.calendarDay = nextCalendarDay;
      window.__AIML_CALENDAR_DAY = nextCalendarDay;

      try {
        const base = apiBase();
        const cacheBust = Date.now();
        const [calendarSnapshotRaw, latestRaw] = await Promise.all([
          fetchSnapshot(base, nextCalendarDay, cacheBust).catch(() => null),
          fetchJsonWithTimeout(
            `${base}/deploy-snapshot/latest?_t=${cacheBust}`,
            10000
          ).catch(() => null)
        ]);

        const calendarSnapshot = snapshotMeta(calendarSnapshotRaw);
        const latest = latestMeta(latestRaw);
        const calendarReleaseReady = releaseMatchesLatest(
          calendarSnapshot,
          latest,
          nextCalendarDay
        );

        let verifiedDay = null;
        let verifiedHash = null;

        if (calendarReleaseReady) {
          verifiedDay = nextCalendarDay;
          verifiedHash = calendarSnapshot.hash;
        } else if (
          latest.ok &&
          latest.day &&
          compareDay(latest.day, nextCalendarDay) <= 0
        ) {
          // latest points at today or an older release. Verify the pointed
          // snapshot before using it as the automatic fallback.
          const fallbackRaw = latest.day === nextCalendarDay
            ? calendarSnapshotRaw
            : await fetchSnapshot(base, latest.day, cacheBust).catch(() => null);
          const fallback = snapshotMeta(fallbackRaw);

          if (
            fallback.ok &&
            fallback.day === latest.day &&
            fallback.hash === latest.hash
          ) {
            verifiedDay = fallback.day;
            verifiedHash = fallback.hash;
          }
        }

        // Never advance from the currently verified release unless the candidate
        // is itself verified, and never allow an automatic future day.
        if (
          validDay(verifiedDay) &&
          compareDay(verifiedDay, nextCalendarDay) <= 0
        ) {
          state.day = verifiedDay;
          state.publishedDay = verifiedDay;
          window.__AIML_OPERATIONAL_DAY = verifiedDay;
          rememberPublishedDay(verifiedDay);
        } else {
          state.publishedDay = validDay(state.day) ? state.day : null;
          window.__AIML_OPERATIONAL_DAY = state.day;
        }

        state.engineSnapshotReady = calendarReleaseReady;
        state.engineSnapshotDay = calendarSnapshot.day;
        state.engineSnapshotHash = calendarSnapshot.hash;
        state.engineLatestDay = latest.day;
        state.engineLatestHash = latest.hash;
        state.checkedAt = new Date().toISOString();
        state.error = null;

        void verifiedHash;
      } catch (error) {
        // Network/engine failure must NOT roll the day forward. Keep the last
        // verified release and expose the failure only as readiness metadata.
        state.engineSnapshotReady = false;
        state.engineSnapshotDay = null;
        state.engineSnapshotHash = null;
        state.checkedAt = new Date().toISOString();
        state.error = String(error?.message || error);
      }

      const calendarChanged = previous.calendarDay !== state.calendarDay;
      const dayChanged = previous.day !== state.day;
      const readinessChanged =
        previous.engineSnapshotReady !== state.engineSnapshotReady ||
        previous.engineSnapshotDay !== state.engineSnapshotDay ||
        previous.engineSnapshotHash !== state.engineSnapshotHash ||
        previous.engineLatestDay !== state.engineLatestDay ||
        previous.engineLatestHash !== state.engineLatestHash ||
        previous.error !== state.error;

      if (calendarChanged) {
        emit("calendar-day:change", {
          previousDay: previous.calendarDay,
          day: state.calendarDay,
          state: { ...state }
        });
      }

      // Existing consumers deliberately keep using operational-day:change. It is
      // now a PUBLICATION transition, not a raw clock-midnight transition.
      if (dayChanged) {
        emit("operational-day:change", {
          previousDay: previous.day,
          day: state.day,
          calendarDay: state.calendarDay,
          state: { ...state }
        });
      }

      if (calendarChanged || dayChanged || readinessChanged) {
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
    getCalendarDay: () => state.calendarDay,
    getPublishedDay: () => state.publishedDay || state.day,
    getState: () => ({ ...state }),
    refresh: refreshReadiness,
    ready: null,
    __test: {
      validDay,
      addDays,
      snapshotMeta,
      latestMeta,
      releaseMatchesLatest
    }
  };

  api.ready = refreshReadiness();
  window.AIML_OperationalDay = api;

  window.setInterval(() => {
    refreshReadiness().catch(() => {});
  }, 60000);
})();
