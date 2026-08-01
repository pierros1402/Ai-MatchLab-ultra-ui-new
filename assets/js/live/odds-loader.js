// =====================================================
// ODDS LOADER — FINAL (API v2 compatible)
// Source: GET /odds?matchId=XXX&date=YYYY-MM-DD&market=1X2
// Emits: odds-snapshot:canonical
// =====================================================

(function () {
  if (typeof window.on !== "function" || typeof window.emit !== "function") {
    console.warn("[odds-loader] event bus not ready");
    return;
  }

  const CFG = window.AIML_LIVE_CFG || {};
  const BASE =
    (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
      ? window.AIML_CONFIG.BASE_URL
      : CFG.fixturesBase;
  const PATH = "/odds";

  if (!BASE) {
    console.warn("[odds-loader] missing BASE_URL");
    return;
  }

  let requestGeneration = 0;
  let controller = null;

  function validDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function operationalDay() {
    const day = window.AIML_OperationalDay?.getDay?.();
    if (validDay(day)) return String(day);
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  window.on("match-selected", match => {
    const id = match && (match.id ?? match.matchId) != null
      ? String(match.id ?? match.matchId)
      : null;
    if (!id) return;

    const selectedDay = String(match?.date || window.__AIML_SELECTED_DATE || "").slice(0, 10);
    const day = validDay(selectedDay) ? selectedDay : operationalDay();
    fetchOddsForMatch(id, day);
  });

  window.on("date:change", () => {
    requestGeneration += 1;
    controller?.abort();
    controller = null;
  });

  async function fetchOddsForMatch(matchId, day) {
    const generation = ++requestGeneration;
    controller?.abort();
    controller = new AbortController();
    const localController = controller;
    const timer = window.setTimeout(() => localController.abort(), 12000);

    try {
      const url =
        `${BASE}${PATH}` +
        `?matchId=${encodeURIComponent(matchId)}` +
        `&date=${encodeURIComponent(day)}` +
        `&market=1X2`;

      const res = await fetch(url, {
        cache: "no-store",
        signal: localController.signal
      });

      if (generation !== requestGeneration) return;
      if (!res.ok) {
        console.warn("[odds-loader] fetch failed", res.status);
        return;
      }

      const json = await res.json();
      if (generation !== requestGeneration) return;

      if (!json || !json.snapshot) {
        console.warn("[odds-loader] empty odds snapshot");
        return;
      }

      window.emit("odds-snapshot:core", {
        matchId,
        date: day,
        snapshot: json.snapshot
      });
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("[odds-loader] error", err);
      }
    } finally {
      window.clearTimeout(timer);
      if (controller === localController) controller = null;
    }
  }
})();
