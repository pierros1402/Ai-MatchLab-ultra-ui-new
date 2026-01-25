/* ============================================================
   OIC ENGINE — LOCKED (SAFE, NO SIDE EFFECTS)
   Contract:
   - Consumes: match-selected {id,home,away,leagueName...}
   - Consumes: odds-snapshot:core { matchId, markets?... } OR any snapshot object (optional)
   - Emits:    market-selected { market, source:"oic" }
   - Calls:    window.OICRenderer.renderAll({ market, match, snapshot })
   Notes:
   - Does NOT fetch odds.
   - Handles missing/empty odds (snapshot null) gracefully.
============================================================ */
(function () {
  "use strict";

  var DEFAULT_MARKET = "1X2";

  var state = {
    market: DEFAULT_MARKET,
    match: null,
    snapshotByMatchId: Object.create(null) // matchId -> snapshot
  };

  function on(ev, fn) {
    if (window.on) return window.on(ev, fn);
    window.addEventListener(ev, function (e) { fn(e.detail); });
  }
  function emit(ev, payload) {
    if (window.emit) return window.emit(ev, payload);
    window.dispatchEvent(new CustomEvent(ev, { detail: payload }));
  }

  function normalizeMarket(v) {
    var m = (v || "").toUpperCase().trim();
    if (m === "BTTS") m = "GG"; // index.html uses BTTS; internal uses GG
    if (m === "OU1.5" || m === "OU_15" || m === "OU15") m = "OU15";
    if (m === "OU2.5" || m === "OU_25" || m === "OU25") m = "OU25";
    if (m === "OU3.5" || m === "OU_35" || m === "OU35") m = "OU35";
    return m;
  }

  function clampMarket(m) {
    m = normalizeMarket(m);
    var ok = { "1X2": 1, "DC": 1, "GG": 1, "OU15": 1, "OU25": 1, "OU35": 1 };
    return ok[m] ? m : DEFAULT_MARKET;
  }

  function setMarket(m, source) {
    var next = clampMarket(m);
    if (next === state.market) return;
    state.market = next;

    // keep UI selector in sync (if present)
    var sel = document.querySelector(".oic-market-select");
if (sel) {
  sel.value = (next === "GG") ? "BTTS" : next;
}

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

  // Accepts:
  // - { matchId, snapshot } from KV endpoint
  // - direct snapshot that includes matchId or id
  function upsertSnapshot(payload) {
    if (!payload) return;

    var matchId = payload.matchId || payload.id || (payload.match && payload.match.id);
    var snap = payload.snapshot || payload;

    if (!matchId) return;
    state.snapshotByMatchId[String(matchId)] = snap;

    if (state.match && String(matchId) === state.match.id) render();
  }

  function currentSnapshot() {
    if (!state.match) return null;
    return state.snapshotByMatchId[state.match.id] || null;
  }

  function render() {
    if (!window.OICRenderer || typeof window.OICRenderer.renderAll !== "function") return;

    window.OICRenderer.renderAll({
      market: state.market,
      match: state.match,
      snapshot: currentSnapshot()
    });
  }

  function bindUI() {
    var sel = document.querySelector(".oic-market-select");
    if (sel) {
      // initial sync
      sel.value = sel.value || state.market;
      state.market = clampMarket(sel.value);

      sel.addEventListener("change", function () {
        var v = sel.value === "BTTS" ? "GG" : sel.value;
        setMarket(v, "oic-ui");
      });
    }
  }

  function init() {
    bindUI();

    on("match-selected", setMatch);

    // Core snapshot (optional, harmless if never emitted)
    on("odds-snapshot:core", upsertSnapshot);

    // Optional: canonical snapshot if used elsewhere (harmless)
    on("odds-snapshot:canonical", upsertSnapshot);

    updateActiveMatchUI(null);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
