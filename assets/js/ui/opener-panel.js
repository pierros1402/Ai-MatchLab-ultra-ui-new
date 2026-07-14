/* opener-panel.js — Opening Tracker panel
 * Shows upcoming matches with opening vs current odds for each bookmaker.
 * Driven by /api/multi-odds-day?date=X.
 * The fetched day payload is also shared with the four bookmaker panels so the
 * same odds are routed to Greek / European / Asian / Betfair views.
 */

(function () {
  "use strict";

  var body = document.getElementById("opener-body");
  var dateEl = document.getElementById("opener-date");
  var mktEl = document.getElementById("opener-market");

  if (!body || !dateEl || !mktEl) return;

  var BASE = resolveBase();

  var LEG_LABELS = {
    home: "1", draw: "X", away: "2",
    over: "O", under: "U",
    yes: "GG", no: "NG"
  };

  var REF_PRIORITY = ["pinnacle", "bet365", "bwin", "unibet", "1xbet", "william hill"];

  function resolveBase() {
    var cfg = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
    return String(cfg.BASE_URL || cfg.fixturesBase || "").replace(/\/$/, "");
  }

  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  function fmt(x) {
    var n = Number(x);
    return isFinite(n) ? n.toFixed(2) : "—";
  }

  function timeAgo(ts) {
    if (!ts) return "";
    var value = typeof ts === "number" ? ts : Date.parse(ts);
    if (!isFinite(value)) return "";
    var diff = Math.max(0, Date.now() - value);
    var h = Math.floor(diff / 3600000);
    var d = Math.floor(h / 24);
    if (d >= 1) return d + "d ago";
    if (h >= 1) return h + "h ago";
    return "<1h ago";
  }

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

  function addDays(ymd, n) {
    return new Date(new Date(ymd + "T12:00:00Z").getTime() + n * 86400000)
      .toISOString().slice(0, 10);
  }

  function shortDate(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  function emitSafe(eventName, payload) {
    if (typeof window.emit === "function") {
      window.emit(eventName, payload);
      return true;
    }
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function publishDayPayload(date, payload) {
    if (!window.AIML_MULTI_ODDS_DAY_CACHE) {
      window.AIML_MULTI_ODDS_DAY_CACHE = Object.create(null);
    }
    window.AIML_MULTI_ODDS_DAY_CACHE[date] = payload;
    emitSafe("odds-day:multi", {
      date: date,
      matches: payload && payload.matches ? payload.matches : {},
      payload: payload,
      source: "opening-tracker"
    });
  }

  function selectTrackerMatch(matchId, rec) {
    var match = {
      id: String(matchId),
      matchId: String(matchId),
      home: rec.home || rec.homeTeam || "",
      away: rec.away || rec.awayTeam || "",
      league: rec.league || rec.leagueName || rec.competition || "",
      date: state.date,
      kickoffUtc: rec.kickoffUtc || rec.kickoff || null
    };

    emitSafe("match-selected", match);
    emitSafe("active-match:set", match);
    emitSafe("odds-snapshot:multi", {
      matchId: String(matchId),
      markets: rec.markets || {},
      date: state.date,
      source: "opening-tracker-click"
    });
    emitSafe("nav:oic", { tab: "odds", source: "opening-tracker" });
  }

  var state = { date: null, market: "1X2", data: null, loading: false, requestSeq: 0 };

  function populateDates() {
    var today = athensToday();
    dateEl.innerHTML = "";

    var todayOpt = document.createElement("option");
    todayOpt.value = today;
    todayOpt.textContent = "Today";
    dateEl.appendChild(todayOpt);

    for (var i = 1; i <= 7; i++) {
      var date = addDays(today, i);
      var opt = document.createElement("option");
      opt.value = date;
      opt.textContent = shortDate(date);
      dateEl.appendChild(opt);
    }

    dateEl.value = today;
    state.date = today;
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    var seq = ++state.requestSeq;
    body.innerHTML = '<div class="opener-empty">Loading…</div>';

    try {
      BASE = resolveBase();
      if (!BASE) throw new Error("BASE_URL not ready");

      var url = BASE + "/api/multi-odds-day?date=" + encodeURIComponent(state.date);
      var response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var json = await response.json();
      if (seq !== state.requestSeq) return;

      state.data = json;
      publishDayPayload(state.date, json);
      render(json);
    } catch (err) {
      if (seq !== state.requestSeq) return;
      body.innerHTML = '<div class="opener-empty">Error loading odds.</div>';
      console.error("[opener-panel]", err);
    } finally {
      if (seq === state.requestSeq) state.loading = false;
    }
  }

  function render(json) {
    var matches = json && json.matches ? Object.entries(json.matches) : [];
    if (!matches.length) {
      body.innerHTML = '<div class="opener-empty">No pre-fetched odds for this date yet.</div>';
      return;
    }

    var market = state.market;
    var relevant = matches.filter(function (entry) {
      return entry[1] && entry[1].markets && entry[1].markets[market];
    });

    if (!relevant.length) {
      body.innerHTML = '<div class="opener-empty">No ' + market + ' data for this date.</div>';
      return;
    }

    relevant.sort(function (a, b) {
      var ta = a[1].kickoffUtc || "";
      var tb = b[1].kickoffUtc || "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    body.innerHTML = "";

    relevant.forEach(function (entry) {
      var matchId = entry[0];
      var rec = entry[1];
      var marketData = rec.markets[market] || {};

      var allBooks = {};
      ["greek", "european", "eu", "asian", "betfair"].forEach(function (panel) {
        Object.entries(marketData[panel] || {}).forEach(function (kv) {
          var normalizedPanel = panel === "eu" ? "european" : panel;
          allBooks[kv[0]] = { data: kv[1], panel: normalizedPanel };
        });
      });

      // Flat-market fallback. This keeps the tracker and four OIC panels aligned
      // even if the API supplies bookmaker keys without pre-grouping.
      if (!Object.keys(allBooks).length && window.OICRenderer
        && typeof window.OICRenderer.normalizeMultiMarketData === "function") {
        var grouped = window.OICRenderer.normalizeMultiMarketData(marketData);
        ["greek", "european", "asian", "betfair"].forEach(function (panel) {
          Object.entries(grouped[panel] || {}).forEach(function (kv) {
            allBooks[kv[0]] = { data: kv[1], panel: panel };
          });
        });
      }

      if (!Object.keys(allBooks).length) return;

      var refBook = null;
      for (var pi = 0; pi < REF_PRIORITY.length; pi++) {
        if (allBooks[REF_PRIORITY[pi]]) {
          refBook = REF_PRIORITY[pi];
          break;
        }
      }
      if (!refBook) refBook = Object.keys(allBooks)[0];

      var refOdds = allBooks[refBook].data || {};
      if (refOdds.current && typeof refOdds.current === "object") refOdds = refOdds.current;
      var legs = Object.keys(refOdds).filter(function (key) {
        return key !== "open" && key !== "delta" && key !== "current" && typeof refOdds[key] !== "object";
      });
      if (!legs.length) return;

      var matchDiv = el("div", "opener-match");
      matchDiv.setAttribute("data-match-id", String(matchId));
      matchDiv.setAttribute("role", "button");
      matchDiv.setAttribute("tabindex", "0");
      matchDiv.setAttribute("aria-label", "Show odds for " + (rec.home || "") + " versus " + (rec.away || ""));
      matchDiv.addEventListener("click", function () { selectTrackerMatch(matchId, rec); });
      matchDiv.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTrackerMatch(matchId, rec);
        }
      });

      var titleDiv = el("div", "opener-match-title");
      titleDiv.appendChild(el("span", "", (rec.home || "?") + " vs " + (rec.away || "?")));
      titleDiv.appendChild(el("span", "opener-match-open-age", "Open: " + timeAgo(rec.openedAt)));
      matchDiv.appendChild(titleDiv);

      var movers = [];
      var stable = [];
      Object.entries(allBooks).forEach(function (kv) {
        var book = kv[0];
        var odds = kv[1].data || {};
        var deltaBlock = odds.delta || {};
        var hasDelta = legs.some(function (leg) { return Number(deltaBlock[leg]) !== 0; });
        if (hasDelta) movers.push(book);
        else stable.push(book);
      });

      var toShow = [refBook];
      movers.filter(function (book) { return book !== refBook; }).forEach(function (book) {
        if (toShow.length < 6) toShow.push(book);
      });
      stable.filter(function (book) { return book !== refBook; }).forEach(function (book) {
        if (toShow.length < 6) toShow.push(book);
      });

      matchDiv.style.setProperty("--opener-cols", legs.length);

      var header = el("div", "opener-odds-header");
      header.style.gridTemplateColumns = "130px repeat(" + legs.length + ", minmax(0,1fr))";
      header.appendChild(el("div", "", ""));
      legs.forEach(function (leg) { header.appendChild(el("div", "", LEG_LABELS[leg] || leg)); });
      matchDiv.appendChild(header);

      toShow.forEach(function (book) {
        var odds = allBooks[book].data || {};
        var currentBlock = odds.current && typeof odds.current === "object" ? odds.current : odds;
        var openBlock = odds.open || odds.opening || {};
        var deltaBlock = odds.delta || {};

        var row = el("div", "opener-odds-row");
        row.style.gridTemplateColumns = "130px repeat(" + legs.length + ", minmax(0,1fr))";
        row.appendChild(el("div", "opener-book", book));

        legs.forEach(function (leg) {
          var current = currentBlock[leg];
          var opening = openBlock && openBlock[leg];
          var delta = Number(deltaBlock && deltaBlock[leg]);
          var cell = el("div", "opener-cell");
          cell.appendChild(el("div", "opener-curr", fmt(current)));

          if (opening != null && Number(opening) !== Number(current)) {
            cell.appendChild(el("div", "opener-open", fmt(opening)));
          }

          if (isFinite(delta) && delta !== 0) {
            cell.appendChild(el(
              "div",
              "opener-delta " + (delta > 0 ? "delta-up" : "delta-down"),
              (delta > 0 ? "+" : "") + delta.toFixed(2)
            ));
          }

          row.appendChild(cell);
        });

        matchDiv.appendChild(row);
      });

      body.appendChild(matchDiv);
    });
  }

  dateEl.addEventListener("change", function () {
    state.date = dateEl.value;
    state.loading = false;
    load();
  });

  mktEl.addEventListener("change", function () {
    state.market = mktEl.value;
    if (state.data) render(state.data);
  });

  populateDates();

  function tryLoad() {
    BASE = resolveBase();
    if (BASE) {
      load();
      return;
    }
    setTimeout(tryLoad, 400);
  }

  tryLoad();
})();
