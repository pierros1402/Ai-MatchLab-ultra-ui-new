(function () {
  "use strict";

  var DEFAULT_MARKET = "1X2";

  var state = {
    market: DEFAULT_MARKET,
    match: null,
    activeDate: null,
    snapshotByMatchId: Object.create(null),
    multiByMatchId: Object.create(null),
    dayMultiByDate: Object.create(null)
  };

  function on(ev, fn) {
    if (window.on) return window.on(ev, fn);
    window.addEventListener(ev, function (e) { fn(e.detail); });
  }

  function emit(ev, payload) {
    if (window.emit) return window.emit(ev, payload);
    window.dispatchEvent(new CustomEvent(ev, { detail: payload }));
  }

  function resolveMatchId(match) {
    if (!match) return null;
    var id = match.id != null ? match.id
      : match.matchId != null ? match.matchId
      : match.canonicalId != null ? match.canonicalId
      : null;
    return id == null ? null : String(id);
  }

  function normalizeMarket(v) {
    var raw = String(v || "").trim();
    if (raw === "1X2" || raw === "DC" || raw === "BTTS" || raw === "OU15"
      || raw === "OU25" || raw === "OU35" || raw === "DNB" || raw === "HTFT") {
      return raw;
    }
    if (raw === "Double Chance") return "DC";
    if (raw === "Draw No Bet") return "DNB";
    if (raw === "Over / Under 1.5") return "OU15";
    if (raw === "Over / Under 2.5") return "OU25";
    if (raw === "Over / Under 3.5") return "OU35";
    if (raw.toUpperCase() === "GG") return "BTTS";
    return "1X2";
  }

  function clampMarket(m) {
    m = normalizeMarket(m);
    return {
      "1X2": 1, DC: 1, BTTS: 1, OU15: 1,
      OU25: 1, OU35: 1, DNB: 1, HTFT: 1
    }[m] ? m : DEFAULT_MARKET;
  }

  function updateActiveMatchUI(m) {
    var titleEl = document.querySelector(".oic-match-title");
    var subEl = document.querySelector(".oic-match-sub");
    if (!titleEl || !subEl) return;

    if (!m) {
      titleEl.textContent = "No match selected";
      subEl.textContent = "Select a match from the left panel or Opening Tracker.";
      return;
    }

    titleEl.textContent = (m.home && m.away)
      ? (m.home + " – " + m.away)
      : ("Match " + m.id);
    subEl.textContent = m.league || ("ID: " + m.id);
  }

  function currentSnapshot() {
    return state.match ? (state.snapshotByMatchId[state.match.id] || null) : null;
  }

  function currentMulti() {
    return state.match ? (state.multiByMatchId[state.match.id] || null) : null;
  }

  function render() {
    if (!window.OICRenderer) return;

    var multiSnap = currentMulti();
    if (multiSnap && typeof window.OICRenderer.renderMulti === "function") {
      window.OICRenderer.renderMulti({
        market: state.market,
        match: state.match,
        matchId: state.match && state.match.id,
        markets: multiSnap
      });
      return;
    }

    if (typeof window.OICRenderer.renderAll === "function") {
      window.OICRenderer.renderAll({
        market: state.market,
        match: state.match,
        matchId: state.match && state.match.id,
        snapshot: currentSnapshot()
      });
    }
  }

  function setMarket(m, source) {
    var next = clampMarket(m);
    state.market = next;

    var sel = document.querySelector(".oic-market-select");
    if (sel && sel.value !== next) sel.value = next;

    emit("market-selected", { market: next, source: source || "oic" });
    render();
  }

  function findDayRecord(date, matchId) {
    var day = state.dayMultiByDate[date]
      || (window.AIML_MULTI_ODDS_DAY_CACHE && window.AIML_MULTI_ODDS_DAY_CACHE[date]);
    var matches = day && day.matches ? day.matches : null;
    if (!matches) return null;
    if (matches[matchId]) return matches[matchId];

    var keys = Object.keys(matches);
    for (var i = 0; i < keys.length; i++) {
      var rec = matches[keys[i]] || {};
      if (resolveMatchId(rec) === matchId) return rec;
    }
    return null;
  }

  function hydrateFromDayCache() {
    if (!state.match) return false;
    var date = state.match.date || state.activeDate;
    if (!date) return false;
    var rec = findDayRecord(date, state.match.id);
    if (!rec || !rec.markets) return false;
    state.multiByMatchId[state.match.id] = rec.markets;
    return true;
  }

  function setMatch(match) {
    var id = resolveMatchId(match);
    if (!id) {
      state.match = null;
      updateActiveMatchUI(null);
      render();
      return;
    }

    state.match = {
      id: id,
      home: match.home || match.homeTeam || match.home_name || "",
      away: match.away || match.awayTeam || match.away_name || "",
      league: match.leagueName || match.league || match.league_name || "",
      date: match.date || state.activeDate || null
    };
    if (state.match.date) state.activeDate = state.match.date;

    hydrateFromDayCache();
    updateActiveMatchUI(state.match);
    render();
  }

  function upsertSnapshot(payload) {
    if (!payload) return;
    var matchId = payload.matchId || payload.id || (payload.match && resolveMatchId(payload.match));
    var snap = payload.snapshot || payload;
    if (!matchId) return;
    state.snapshotByMatchId[String(matchId)] = snap;
    if (state.match && String(matchId) === state.match.id) render();
  }

  function upsertMulti(payload) {
    if (!payload) return;

    if (payload.clear && !payload.matchId) {
      state.multiByMatchId = Object.create(null);
      state.match = null;
      if (payload.date) state.activeDate = payload.date;
      updateActiveMatchUI(null);
      render();
      return;
    }

    var matchId = payload.matchId != null ? String(payload.matchId) : null;
    if (!matchId || !payload.markets) return;
    state.multiByMatchId[matchId] = payload.markets;
    if (payload.date) state.activeDate = payload.date;
    if (state.match && matchId === state.match.id) render();
  }

  function upsertDayMulti(payload) {
    if (!payload) return;
    var date = payload.date || (payload.payload && payload.payload.date) || state.activeDate;
    var dayPayload = payload.payload || payload.data || payload;
    if (!date || !dayPayload || !dayPayload.matches) return;

    state.dayMultiByDate[date] = dayPayload;
    state.activeDate = date;
    if (hydrateFromDayCache()) render();
  }

  function bindUI() {
    var sel = document.querySelector(".oic-market-select");
    if (!sel) return;
    if (!sel.value || sel.selectedIndex === -1) sel.value = state.market;
    state.market = clampMarket(sel.value);
    sel.addEventListener("change", function () { setMarket(sel.value, "oic-ui"); });
  }

  function init() {
    bindUI();

    on("match-selected", setMatch);
    on("date:change", function (payload) {
      if (payload && payload.date) state.activeDate = payload.date;
    });
    on("odds-snapshot:core", upsertSnapshot);
    on("odds-snapshot:canonical", upsertSnapshot);
    on("odds-snapshot:multi", upsertMulti);
    on("odds-day:multi", upsertDayMulti);
    on("oic-renderer:ready", render);

    var cache = window.AIML_MULTI_ODDS_DAY_CACHE || {};
    Object.keys(cache).forEach(function (date) {
      state.dayMultiByDate[date] = cache[date];
    });

    updateActiveMatchUI(null);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
