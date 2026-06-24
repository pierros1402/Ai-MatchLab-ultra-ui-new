/* opener-panel.js — Opening Tracker panel
 * Shows upcoming matches with opening vs current odds for each bookmaker.
 * Driven by /api/multi-odds-day?date=X (the prefetch + day-of data).
 */

(function () {
  "use strict";

  var body    = document.getElementById("opener-body");
  var dateEl  = document.getElementById("opener-date");
  var mktEl   = document.getElementById("opener-market");

  if (!body || !dateEl || !mktEl) return;

  var CFG  = window.AIML_CONFIG || window.AIML_LIVE_CFG || {};
  var BASE = CFG.BASE_URL || CFG.fixturesBase || "";

  // ── Leg display labels ─────────────────────────────────────────────────────
  var LEG_LABELS = {
    home: "1", draw: "X", away: "2",
    over: "O", under: "U",
    yes: "GG", no: "NG",
  };

  // Reference books priority (first found is the "display" book per match)
  var REF_PRIORITY = ["pinnacle", "bet365", "bwin", "unibet", "1xbet", "william hill"];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  function fmt(x) {
    return (typeof x === "number" && isFinite(x)) ? x.toFixed(2) : "—";
  }

  function timeAgo(ts) {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var h = Math.floor(diff / 3600000);
    var d = Math.floor(h / 24);
    if (d >= 1) return d + "d ago";
    if (h >= 1) return h + "h ago";
    return "<1h ago";
  }

  function utcToLocal(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  // Athens "today"
  function athensToday() {
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function addDays(ymd, n) {
    return new Date(new Date(ymd + "T12:00:00Z").getTime() + n * 86400000)
      .toISOString().slice(0, 10);
  }

  function shortDate(ymd) {
    var d = new Date(ymd + "T12:00:00Z");
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[d.getUTCMonth()] + " " + d.getUTCDate();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  var state = { date: null, market: "1X2", data: null, loading: false };

  // ── Date dropdown ──────────────────────────────────────────────────────────

  function populateDates() {
    var today = athensToday();
    dateEl.innerHTML = "";
    for (var i = 1; i <= 7; i++) {
      var d = addDays(today, i);
      var opt = document.createElement("option");
      opt.value = d;
      opt.textContent = shortDate(d);
      dateEl.appendChild(opt);
    }
    // Also add today and yesterday to see "just fetched" opening vs current
    var todayOpt = document.createElement("option");
    todayOpt.value = today;
    todayOpt.textContent = "Today";
    dateEl.insertBefore(todayOpt, dateEl.firstChild);

    dateEl.value = addDays(today, 1); // default: tomorrow
    state.date = dateEl.value;
  }

  // ── Fetch & render ─────────────────────────────────────────────────────────

  async function load() {
    if (state.loading) return;
    state.loading = true;
    body.innerHTML = '<div class="opener-empty">Loading…</div>';

    try {
      var url = BASE + "/api/multi-odds-day?date=" + encodeURIComponent(state.date);
      var r = await fetch(url, { cache: "no-store" });
      var j = await r.json();
      state.data = j;
      render(j);
    } catch (e) {
      body.innerHTML = '<div class="opener-empty">Error loading odds.</div>';
      console.error("[opener-panel]", e);
    } finally {
      state.loading = false;
    }
  }

  function render(j) {
    var matches = j && j.matches ? Object.entries(j.matches) : [];
    if (!matches.length) {
      body.innerHTML = '<div class="opener-empty">No pre-fetched odds for this date yet.</div>';
      return;
    }

    var market = state.market;

    // Filter to matches that have the selected market
    var relevant = matches.filter(function (entry) {
      return entry[1].markets && entry[1].markets[market];
    });

    if (!relevant.length) {
      body.innerHTML = '<div class="opener-empty">No ' + market + ' data for this date.</div>';
      return;
    }

    // Sort by kickoffUtc (if available from canonical via API; otherwise use matchId order)
    relevant.sort(function (a, b) {
      var ta = a[1].kickoffUtc || ""; var tb = b[1].kickoffUtc || "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    body.innerHTML = "";
    relevant.forEach(function (entry) {
      var matchId = entry[0];
      var rec     = entry[1];
      var mktData = rec.markets[market];

      // Collect all books across all panels
      var allBooks = {};
      ["greek","european","asian","betfair"].forEach(function (panel) {
        Object.entries(mktData[panel] || {}).forEach(function (kv) {
          allBooks[kv[0]] = { data: kv[1], panel: panel };
        });
      });

      if (!Object.keys(allBooks).length) return;

      // Pick reference book (Pinnacle → bet365 → first available)
      var refBook = null;
      for (var pi = 0; pi < REF_PRIORITY.length; pi++) {
        if (allBooks[REF_PRIORITY[pi]]) { refBook = REF_PRIORITY[pi]; break; }
      }
      if (!refBook) refBook = Object.keys(allBooks)[0];

      var refOdds = allBooks[refBook].data;

      // Derive legs from data
      var legs = Object.keys(refOdds).filter(function (k) { return k !== "open" && k !== "delta"; });

      // Match header
      var matchDiv = el("div", "opener-match");

      var titleDiv = el("div", "opener-match-title");
      var nameSpan = el("span", "", (rec.home || "?") + " vs " + (rec.away || "?"));
      var metaSpan = el("span", "opener-match-time");
      var openAge  = el("span", "opener-match-open-age", "Open: " + timeAgo(rec.openedAt));
      metaSpan.textContent = "";
      titleDiv.appendChild(nameSpan);
      titleDiv.appendChild(openAge);
      matchDiv.appendChild(titleDiv);

      // Books that have moved (show movers first, then stable)
      var movers  = [];
      var stable  = [];
      Object.entries(allBooks).forEach(function (kv) {
        var bk = kv[0]; var d = kv[1].data;
        var hasDelta = d.delta && legs.some(function (l) { return d.delta[l] !== 0; });
        if (hasDelta) movers.push(bk);
        else          stable.push(bk);
      });

      // Show: ref book always first, then top movers (max 6 total)
      var toShow = [refBook];
      movers.filter(function (b) { return b !== refBook; }).forEach(function (b) {
        if (toShow.length < 6) toShow.push(b);
      });
      stable.filter(function (b) { return b !== refBook; }).forEach(function (b) {
        if (toShow.length < 6) toShow.push(b);
      });

      // Column count CSS var
      matchDiv.style.setProperty("--opener-cols", legs.length);

      // Header row
      var hdr = el("div", "opener-odds-header");
      hdr.style.gridTemplateColumns = "130px repeat(" + legs.length + ", minmax(0,1fr))";
      hdr.appendChild(el("div", "", ""));
      legs.forEach(function (l) {
        hdr.appendChild(el("div", "", LEG_LABELS[l] || l));
      });
      matchDiv.appendChild(hdr);

      // Book rows
      toShow.forEach(function (bk) {
        var d = allBooks[bk].data;
        var row = el("div", "opener-odds-row");
        row.style.gridTemplateColumns = "130px repeat(" + legs.length + ", minmax(0,1fr))";
        row.appendChild(el("div", "opener-book", bk));

        legs.forEach(function (l) {
          var curr  = d[l];
          var open  = d.open && d.open[l];
          var delta = d.delta && d.delta[l];

          var cell = el("div", "opener-cell");
          cell.appendChild(el("div", "opener-curr", fmt(curr)));

          if (open != null && open !== curr) {
            cell.appendChild(el("div", "opener-open", fmt(open)));
          }

          if (typeof delta === "number" && delta !== 0) {
            var dEl = el("div", "opener-delta " + (delta > 0 ? "delta-up" : "delta-down"),
              (delta > 0 ? "+" : "") + delta.toFixed(2));
            cell.appendChild(dEl);
          }

          row.appendChild(cell);
        });

        matchDiv.appendChild(row);
      });

      body.appendChild(matchDiv);
    });
  }

  // ── Event bindings ─────────────────────────────────────────────────────────

  dateEl.addEventListener("change", function () {
    state.date = dateEl.value;
    load();
  });

  mktEl.addEventListener("change", function () {
    state.market = mktEl.value;
    if (state.data) render(state.data); // re-render from cache, no new fetch
  });

  // ── Init ───────────────────────────────────────────────────────────────────

  populateDates();

  // Wait for API base to be available, then load
  function tryLoad() {
    BASE = (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
      || (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
      || "";
    if (BASE) { load(); return; }
    setTimeout(tryLoad, 400);
  }
  tryLoad();

})();
