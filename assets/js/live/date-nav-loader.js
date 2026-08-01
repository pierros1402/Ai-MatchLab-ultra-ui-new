/* date-nav-loader.js
 * Listens to date:change → fetches /api/matches-for-date → emits matches:set
 * Leaves "today" handling to the existing fixtures-loader (doesn't interfere).
 */

(function () {
  "use strict";

  var BASE = (window.AIML && window.AIML.config && window.AIML.config.apiBase)
    ? window.AIML.config.apiBase
    : (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
    ? window.AIML_LIVE_CFG.fixturesBase
    : "";

  function emit(ev, detail) {
    window.dispatchEvent(new CustomEvent(ev, { detail: detail }));
    if (window.AIML && window.AIML.emit) window.AIML.emit(ev, detail);
  }

  function on(ev, fn) {
    window.addEventListener(ev, function (e) { fn(e.detail); });
    if (window.AIML && window.AIML.on) window.AIML.on(ev, fn);
  }

  function operationalToday() {
    var serviceDay = window.AIML_OperationalDay &&
      typeof window.AIML_OperationalDay.getDay === "function"
      ? window.AIML_OperationalDay.getDay()
      : "";

    var today = /^\d{4}-\d{2}-\d{2}$/.test(String(serviceDay || ""))
      ? String(serviceDay)
      : new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });

    window.__AIML_OPERATIONAL_DAY = today;
    return today;
  }

  function setSelectedDate(date) {
    var today = operationalToday();
    var ymd = String(date || today).slice(0, 10);
    window.__AIML_SELECTED_DATE = ymd;
    window.__AIML_VIEWING_NON_TODAY_DATE = ymd !== today ? ymd : null;
  }



  var activeDate = null;
  var activeController = null;
  var requestGeneration = 0;

  async function loadMatchesForDate(date) {
    var requestedDate = String(date || "").slice(0, 10);
    var generation = ++requestGeneration;
    if (activeController) activeController.abort();
    var controller = new AbortController();
    activeController = controller;
    var timer = window.setTimeout(function () { controller.abort(); }, 12000);
    try {
      var r = await fetch(
        BASE + "/api/matches-for-date?date=" + encodeURIComponent(requestedDate),
        { cache: "no-store", signal: controller.signal }
      );
      if (!r.ok) throw new Error("HTTP " + r.status);
      var j = await r.json();
      if (generation !== requestGeneration || activeDate !== requestedDate) return;
      if (!j.ok) { console.warn("[date-nav-loader] not ok for", requestedDate, j); return; }

      // Normalise to the shape matches-panel.js expects
      var matches = (j.matches || []).map(function (m) {
        return {
          id:       m.matchId,
          matchId:  m.matchId,
          home:     m.homeTeam,
          away:     m.awayTeam,
          kickoff:  m.kickoffUtc ? m.kickoffUtc.slice(11, 16) : "",
          kickoffUtc: m.kickoffUtc || "",
          status:   m.status || "PRE",
          rawStatus: m.rawStatus || "",
          statusType: m.statusType || "",
          statusName: m.statusName || "",
          leagueSlug: m.leagueSlug || "",
          leagueName: m.leagueName || "",
          scoreHome: m.scoreHome,
          scoreAway: m.scoreAway,
          penalties: m.penalties || null,
          decidedBy: m.decidedBy || null,
          date:     requestedDate,
        };
      });

      // Feed both panels — Active Leagues (compact) and Matches & Details (with assessments)
      document.dispatchEvent(new CustomEvent("active-leagues:updated", { detail: { matches: matches, date: requestedDate } }));
      emit("matches:set", { matches: matches, date: requestedDate });
      emit("date-matches:loaded", { date: requestedDate, count: matches.length, source: j.source });
      console.log("[date-nav-loader]", requestedDate, matches.length, "matches from", j.source);
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error("[date-nav-loader] error loading", requestedDate, e);
      }
    } finally {
      window.clearTimeout(timer);
      if (activeController === controller) activeController = null;
    }
  }

  on("date:change", function (payload) {
    if (!payload || !payload.date) return;
    activeDate = payload.date;
    setSelectedDate(payload.date);

    // If navigating back to today: let fixtures-loader handle it
    // (it already emitted matches:set on init). But reload anyway to keep current.
    loadMatchesForDate(payload.date);
  });

  // Selected date starts as today until the user navigates.
  setSelectedDate(operationalToday());

  // Europe/Athens rollover is owned by operational-day.js.


  // Expose for debugging
  window.DateNavLoader = { loadDate: loadMatchesForDate };
})();
