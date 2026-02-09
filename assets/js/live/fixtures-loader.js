/* =========================================================
   AIML – FIXTURES LOADER (RUNTIME – VALUE FIX)
   - Uses /fixtures-runtime
   - Keeps backward compatibility
   - FIX: sends correct date to value-adapter
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

  function isPRE(m) {
    const s = String(m?.status || "").toUpperCase();
    return s === "PRE" || s.includes("SCHED") || s.includes("STATUS_SCHEDULED");
  }

  function isLIVE(m) {
    const s = String(m?.status || "").toUpperCase();
    return s === "LIVE" || s === "IN" || s.includes("IN_PROGRESS") || s === "STATUS_IN_PROGRESS";
  }

  function buildActiveLeagues(matches) {
    const pre = matches.filter(isPRE);
    const map = new Map();

    for (const m of pre) {
      const leagueSlug = String(m.leagueSlug || "").trim();
      const leagueName = String(m.leagueName || m.league || leagueSlug || "UNKNOWN").trim();
      const key = leagueSlug || leagueName;
      if (!key) continue;

      const cur = map.get(key) || {
        leagueSlug,
        leagueName,
        count: 0,
        matches: []
      };

      cur.count += 1;
      cur.matches.push(m);
      map.set(key, cur);
    }

    return Array.from(map.values()).sort((a, b) => (b.count - a.count));
  }

  async function fetchRuntime(mode) {
    const url =
      base +
      "/fixtures-runtime" +
      `?mode=${encodeURIComponent(mode)}` +
      `&_t=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("runtime fetch failed: " + res.status);
    return res.json();
  }

  function emitTodayCompat(data) {
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

  function emitActiveCompat(leagues) {
    window.emit("active-leagues:updated", leagues);
  }

  function emitLiveCompat(matches) {
    const payload = { source: "fixtures-runtime", matches };
    window.emit("live-matches:updated", payload);
    window.emit("live:updated", matches);
  }

  async function loadAll() {
    if (busy) return;
    busy = true;

    try {
      const today = await fetchRuntime("today");
      const todayMatches = safeArr(today?.matches);

      emitTodayCompat(today);

      const activeLeagues = buildActiveLeagues(todayMatches);
      emitActiveCompat(activeLeagues);

      const live = await fetchRuntime("live");
      const liveMatches = safeArr(live?.matches).filter(isLIVE);
      emitLiveCompat(liveMatches);

    } catch (err) {
      console.warn("[fixtures-loader] runtime error", err);
    } finally {
      busy = false;
    }
  }

  loadAll();
  setInterval(loadAll, POLL_INTERVAL);

})();