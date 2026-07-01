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

  function athensToday() {
    try {
      return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function setSelectedDate(date) {
    var ymd = String(date || athensToday()).slice(0, 10);
    window.__AIML_SELECTED_DATE = ymd;
    window.__AIML_VIEWING_NON_TODAY_DATE = ymd !== athensToday() ? ymd : null;
  }


  var activeDate = null;
  var loading = false;

  async function loadMatchesForDate(date) {
    if (loading) return;
    loading = true;
    try {
      var r = await fetch(BASE + "/api/matches-for-date?date=" + encodeURIComponent(date));
      var j = await r.json();
      if (!j.ok) { console.warn("[date-nav-loader] not ok for", date, j); return; }

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
          date:     date,
        };
      });

      // Feed both panels — Active Leagues (compact) and Matches & Details (with assessments)
      document.dispatchEvent(new CustomEvent("active-leagues:updated", { detail: { matches: matches, date: date } }));
      emit("matches:set", { matches: matches, date: date });
      emit("date-matches:loaded", { date: date, count: matches.length, source: j.source });
      console.log("[date-nav-loader]", date, matches.length, "matches from", j.source);
    } catch (e) {
      console.error("[date-nav-loader] error loading", date, e);
    } finally {
      loading = false;
    }
  }

  on("date:change", function (payload) {
    if (!payload || !payload.date) return;
    activeDate = payload.date;

    // If navigating back to today: let fixtures-loader handle it
    // (it already emitted matches:set on init). But reload anyway to keep current.
    loadMatchesForDate(payload.date);
  });

  // Expose for debugging
  window.DateNavLoader = { loadDate: loadMatchesForDate };
})();
