// multi-odds-loader.js
// Fetches per-bookmaker odds for the selected match and emits:
//   odds-snapshot:multi { matchId, markets, date, source }
// The loader is deliberately tolerant of script/config load order and can
// fall back to the already-fetched Opening Tracker day payload.

(function () {
  "use strict";

  if (window.__AIML_MULTI_ODDS_LOADER__) return;
  window.__AIML_MULTI_ODDS_LOADER__ = true;

  var activeDate = athensToday();
  var activeMatchId = null;
  var requestSeq = 0;
  var controller = null;
  var bound = false;

  function athensToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function resolveBase() {
    var cfg = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
    return String(cfg.BASE_URL || cfg.fixturesBase || "").replace(/\/$/, "");
  }

  function validDate(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  }

  function resolveMatchId(m) {
    if (!m) return null;
    var id = m.id != null ? m.id
      : m.matchId != null ? m.matchId
      : m.canonicalId != null ? m.canonicalId
      : null;
    return id == null ? null : String(id);
  }

  // Mirror of the store writer's normTeam (odds/multi-odds-merge.js) so the
  // name fallback below agrees with how the day file was keyed.
  function normTeam(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\b(fc|sc|fk|cf|afc|bk|sk|if|ik|ac|as|rc|cd|ud|ca|ssc|u\d\d)\b/gi, " ")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function dayRecord(date, matchId, match) {
    var cache = window.AIML_MULTI_ODDS_DAY_CACHE || {};
    var payload = cache[date];
    var matches = payload && payload.matches ? payload.matches : null;
    if (!matches) return null;

    if (matches[matchId]) return matches[matchId];

    var keys = Object.keys(matches);
    var i, rec;

    // The day store is keyed by the PROVIDER id (numeric ESPN) while the UI
    // fixtures expose the canonical cid — try the row's provider ids first.
    var altIds = [];
    if (match) {
      if (match.providerMatchId != null) altIds.push(String(match.providerMatchId));
      if (match.sourceMatchId != null) altIds.push(String(match.sourceMatchId));
    }
    for (i = 0; i < altIds.length; i++) {
      if (matches[altIds[i]]) return matches[altIds[i]];
    }

    for (i = 0; i < keys.length; i++) {
      rec = matches[keys[i]] || {};
      var rid = resolveMatchId(rec);
      if (rid === matchId) return rec;
    }

    // Last resort: identity-agnostic team-name match (the record carries the
    // provider's names, the fixture ours — normalize both sides).
    var h = normTeam(match && (match.homeTeam || match.home));
    var a = normTeam(match && (match.awayTeam || match.away));
    if (h && a) {
      for (i = 0; i < keys.length; i++) {
        rec = matches[keys[i]] || {};
        if (normTeam(rec.home) === h && normTeam(rec.away) === a) return rec;
      }
    }
    return null;
  }

  function emitSnapshot(matchId, markets, date, source) {
    if (typeof window.emit !== "function") return;
    window.emit("odds-snapshot:multi", {
      matchId: matchId,
      markets: markets || {},
      date: date || activeDate,
      source: source || "multi-odds"
    });
  }

  function extractMarkets(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.markets && typeof payload.markets === "object") return payload.markets;
    if (payload.data && payload.data.markets && typeof payload.data.markets === "object") {
      return payload.data.markets;
    }
    if (payload.match && payload.match.markets && typeof payload.match.markets === "object") {
      return payload.match.markets;
    }
    return null;
  }

  async function fetchMultiOdds(matchId, date, match) {
    var seq = ++requestSeq;

    // Paint immediately from the day cache when Opening Tracker has already
    // fetched the same record. The per-match request still follows to refresh it.
    var cached = dayRecord(date, matchId, match);
    if (cached && cached.markets) {
      emitSnapshot(matchId, cached.markets, date, "multi-odds-day-cache");
    }

    var base = resolveBase();
    if (!base) {
      console.warn("[multi-odds-loader] BASE_URL not ready; using day cache only");
      if (!cached) emitSnapshot(matchId, {}, date, "multi-odds-no-base");
      return;
    }

    if (controller && typeof controller.abort === "function") {
      try { controller.abort(); } catch (_) {}
    }
    controller = typeof AbortController === "function" ? new AbortController() : null;

    try {
      var url = base + "/api/multi-odds?matchId=" + encodeURIComponent(matchId)
        + "&date=" + encodeURIComponent(date);
      var options = { cache: "no-store" };
      if (controller) options.signal = controller.signal;

      var res = await fetch(url, options);
      if (seq !== requestSeq || matchId !== activeMatchId) return;

      if (!res.ok) {
        if (!cached) emitSnapshot(matchId, {}, date, "multi-odds-http-" + res.status);
        return;
      }

      var json = await res.json();
      if (seq !== requestSeq || matchId !== activeMatchId) return;

      var markets = extractMarkets(json);
      if (!markets || !Object.keys(markets).length) {
        if (!cached) emitSnapshot(matchId, {}, date, "multi-odds-empty");
        return;
      }

      emitSnapshot(matchId, markets, date, "multi-odds-api");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.warn("[multi-odds-loader]", err);
      if (!cached && seq === requestSeq) {
        emitSnapshot(matchId, {}, date, "multi-odds-error");
      }
    }
  }

  function bind() {
    if (bound) return;
    if (typeof window.on !== "function" || typeof window.emit !== "function") {
      setTimeout(bind, 150);
      return;
    }

    bound = true;

    window.on("date:change", function (payload) {
      if (payload && validDate(payload.date)) activeDate = payload.date;
      activeMatchId = null;
      requestSeq++;
      if (controller && typeof controller.abort === "function") {
        try { controller.abort(); } catch (_) {}
      }
      window.emit("odds-snapshot:multi", {
        matchId: null,
        markets: {},
        date: activeDate,
        clear: true,
        source: "date-change"
      });
    });

    window.on("match-selected", function (m) {
      var id = resolveMatchId(m);
      if (!id) return;
      activeMatchId = id;
      var date = m && validDate(m.date) ? m.date : activeDate;
      activeDate = date;
      fetchMultiOdds(id, date, m);
    });
  }

  bind();
})();
