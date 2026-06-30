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

  var activeDate = null;
  var loading = false;

  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  }

  function statusText(m) {
    return [m.status, m.rawStatus, m.statusType, m.statusName]
      .filter(Boolean)
      .map(function (x) { return String(x).toUpperCase(); })
      .join(" ");
  }

  function isFinalStatus(m) {
    var s = statusText(m);
    return s === "FT" || s.indexOf("FULL_TIME") >= 0 || s.indexOf("FINAL") >= 0 ||
      s.indexOf("AET") >= 0 || s.indexOf("PEN") >= 0 || s.indexOf("COMPLETE") >= 0;
  }

  function isSpecialStatus(m) {
    var s = statusText(m);
    return s.indexOf("POSTPON") >= 0 || s.indexOf("CANCEL") >= 0 ||
      s.indexOf("ABANDON") >= 0 || s.indexOf("SUSPEND") >= 0;
  }

  function isLiveStatus(m) {
    var s = statusText(m);
    if (s.indexOf("STALE_LIVE") >= 0) return false;
    return s.indexOf("LIVE") >= 0 || s.indexOf("FIRST_HALF") >= 0 ||
      s.indexOf("SECOND_HALF") >= 0 || s.indexOf("HALF_TIME") >= 0 ||
      s.indexOf("HALFTIME") >= 0 || s.indexOf("IN_PROGRESS") >= 0 ||
      s.indexOf("INPROGRESS") >= 0 || s.indexOf("EXTRA_TIME") >= 0;
  }

  function isPreStatus(m) {
    var s = statusText(m);
    return s === "PRE" || s.indexOf("SCHEDULED") >= 0 || s.indexOf("NOT_STARTED") >= 0;
  }

  function isActiveDisplayMatch(m, date) {
    if (isFinalStatus(m) || isSpecialStatus(m)) return true;
    if (isLiveStatus(m)) return false;

    if (!isPreStatus(m)) return false;

    // Past-date PRE is a stale/missing-final state. Do not feed it to Active Leagues.
    if (date && date < todayKey()) return false;

    var kickoffMs = Date.parse(m.kickoffUtc || "");
    if (!Number.isFinite(kickoffMs)) return true;

    // PRE belongs in Active only before kickoff. After kickoff it should become LIVE or FT.
    return kickoffMs > Date.now();
  }

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

      var activeMatches = matches.filter(function (m) { return isActiveDisplayMatch(m, date); });

      // Feed panels separately. Active Leagues is PRE+FT only; Matches & Details keeps the full date payload.
      document.dispatchEvent(new CustomEvent("active-leagues:updated", { detail: { matches: activeMatches, date: date } }));
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
