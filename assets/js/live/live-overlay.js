/**
 * live-overlay.js
 *
 * Polls the live-worker (Cloudflare) for current scores/status and emits
 * `live:update` — the event the today/live panels already consume to patch scores
 * in place. No deploys needed to refresh: the worker proxies the Flashscore feed.
 *
 * Worker URL: window.AIML_CONFIG.LIVE_WORKER_URL (set after deploying the worker),
 * else the default below.
 */
(function () {
  "use strict";

  var URL_ =
    (window.AIML_CONFIG && window.AIML_CONFIG.LIVE_WORKER_URL) ||
    "https://aimatchlab-live.pierros1402.workers.dev/api/live";

  var POLL_MS = 45 * 1000;
  var inFlight = false;

  function operationalDay() {
    var day = window.AIML_OperationalDay &&
      typeof window.AIML_OperationalDay.getDay === "function"
      ? window.AIML_OperationalDay.getDay()
      : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return String(day);
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function emit(ev, data) {
    if (typeof window.emit === "function") window.emit(ev, data);
    else document.dispatchEvent(new CustomEvent(ev, { detail: data }));
  }

  function toPanelMatch(m) {
    var isLive = m.status === "LIVE";
    return {
      matchId: m.matchId,
      id: m.matchId,
      home: m.home,
      away: m.away,
      homeTeam: m.home,
      awayTeam: m.away,
      leagueName: m.leagueName || "",
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway,
      status: m.status,
      statusType: m.status,
      staleLive: m.staleLive === true,
      statusUnconfirmed: m.statusUnconfirmed === true,
      isLive: isLive,
      live: isLive,
      minute: m.minute != null ? m.minute : null,
      kickoff_ms: m.kickoffUtc ? new Date(m.kickoffUtc).getTime() : 0
    };
  }

  async function poll() {
    if (inFlight) return;
    inFlight = true;
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 12000);
    try {
      var rawFetch = window.__AIML_RAW_FETCH__ || window.fetch;
      var res = await rawFetch(URL_, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return;
      var json = await res.json();
      if (!json || !Array.isArray(json.matches)) return;

      // Only push matches that actually have a score / live state (avoid wiping PRE).
      var matches = json.matches
        .filter(function (m) { return m.scoreHome != null || m.status === "LIVE" || m.status === "FT"; })
        .map(toPanelMatch);

      if (matches.length) {
        window.AIML_LIVE_SCORES = matches;
        const payload = { date: operationalDay(), matches: matches, total: matches.length };
        // Become the single live source the panels boot-replay from.
        window.__AIML_LAST_LIVE = payload;
        emit("live:update", payload);
      }
    } catch (err) {
      /* network blip — next poll retries */
    } finally {
      window.clearTimeout(timer);
      inFlight = false;
    }
  }

  function start() { poll(); setInterval(poll, POLL_MS); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
