(function () {
  "use strict";

  var DEFAULT_MARKET = "1X2";

  var state = {
    market: DEFAULT_MARKET,
    match: null,
    snapshotByMatchId: Object.create(null),
    multiByMatchId: Object.create(null)
  };

  function on(ev, fn) {
    if (window.on) return window.on(ev, fn);
    window.addEventListener(ev, function (e) {
      fn(e.detail);
    });
  }

  function emit(ev, payload) {
    if (window.emit) return window.emit(ev, payload);
    window.dispatchEvent(new CustomEvent(ev, { detail: payload }));
  }

  function normalizeMarket(v) {
    var raw = (v || "").trim();

    if (raw === "1X2") return "1X2";
    if (raw === "DC") return "DC";
    if (raw === "BTTS") return "BTTS";
    if (raw === "OU15") return "OU15";
    if (raw === "OU25") return "OU25";
    if (raw === "OU35") return "OU35";
    if (raw === "DNB") return "DNB";
    if (raw === "HTFT") return "HTFT";

    if (raw === "Double Chance") return "DC";
    if (raw === "Draw No Bet") return "DNB";
    if (raw === "Over / Under 1.5") return "OU15";
    if (raw === "Over / Under 2.5") return "OU25";
    if (raw === "Over / Under 3.5") return "OU35";

    var up = raw.toUpperCase().trim();
    if (up === "GG") return "BTTS";

    return "1X2";
  }

  function clampMarket(m) {
    m = normalizeMarket(m);
    var ok = {
      "1X2": 1,
      "DC": 1,
      "BTTS": 1,
      "OU15": 1,
      "OU25": 1,
      "OU35": 1,
      "DNB": 1,
      "HTFT": 1
    };
    return ok[m] ? m : DEFAULT_MARKET;
  }

  function updateActiveMatchUI(m) {
    var titleEl = document.querySelector(".oic-match-title");
    var subEl = document.querySelector(".oic-match-sub");
    if (!titleEl || !subEl) return;

    if (!m) {
      titleEl.textContent = "No match selected";
      subEl.textContent = "Select a match from the left panel.";
      return;
    }

    var name = (m.home && m.away) ? (m.home + " – " + m.away) : ("Match " + m.id);
    titleEl.textContent = name;
    subEl.textContent = m.league ? m.league : ("ID: " + m.id);
  }

  function currentSnapshot() {
    if (!state.match) return null;
    return state.snapshotByMatchId[state.match.id] || null;
  }

  function currentMulti() {
    if (!state.match) return null;
    return state.multiByMatchId[state.match.id] || null;
  }

  function render() {
    if (!window.OICRenderer) return;

    var multiSnap = currentMulti();
    if (multiSnap && typeof window.OICRenderer.renderMulti === "function") {
      window.OICRenderer.renderMulti({
        market: state.market,
        match:  state.match,
        markets: multiSnap
      });
      return;
    }

    if (typeof window.OICRenderer.renderAll === "function") {
      window.OICRenderer.renderAll({
        market:   state.market,
        match:    state.match,
        snapshot: currentSnapshot()
      });
    }
  }

  function setMarket(m, source) {
    var next = clampMarket(m);
    if (next === state.market) return;

    state.market = next;

    var sel = document.querySelector(".oic-market-select");
    if (sel) sel.value = next;

    emit("market-selected", { market: next, source: source || "oic" });
    render();
  }

  function setMatch(match) {
    if (!match || !match.id) {
      state.match = null;
      updateActiveMatchUI(null);
      render();
      return;
    }

    state.match = {
      id: String(match.id),
      home: match.home || match.homeTeam || match.home_name || "",
      away: match.away || match.awayTeam || match.away_name || "",
      league: match.leagueName || match.league || match.league_name || ""
    };

    updateActiveMatchUI(state.match);
    render();
  }

  function upsertSnapshot(payload) {
    if (!payload) return;
    var matchId = payload.matchId || payload.id || (payload.match && payload.match.id);
    var snap = payload.snapshot || payload;
    if (!matchId) return;
    state.snapshotByMatchId[String(matchId)] = snap;
    if (state.match && String(matchId) === state.match.id) render();
  }

  function upsertMulti(payload) {
    if (!payload || !payload.matchId || !payload.markets) return;
    state.multiByMatchId[String(payload.matchId)] = payload.markets;
    if (state.match && String(payload.matchId) === state.match.id) render();
  }

  function bindUI() {
    var sel = document.querySelector(".oic-market-select");
    if (!sel) return;

    if (!sel.value || sel.selectedIndex === -1) sel.value = state.market || "1X2";

    state.market = clampMarket(sel.value);

    sel.addEventListener("change", function () {
      setMarket(sel.value, "oic-ui");
    });
  }

  function init() {
    bindUI();

    on("match-selected", setMatch);
    on("odds-snapshot:core", upsertSnapshot);
    on("odds-snapshot:canonical", upsertSnapshot);
    on("odds-snapshot:multi", upsertMulti);

    updateActiveMatchUI(null);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();