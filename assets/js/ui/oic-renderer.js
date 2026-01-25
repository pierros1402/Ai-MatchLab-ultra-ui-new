/* ============================================================
   OIC RENDERER — LOCKED (USES EXISTING DOM IDS)
   Targets:
   - #greek-odds-body
   - #eu-odds-body
   - #asian-odds-body
   - #betfair-odds-body
   Behavior:
   - Always renders skeleton tables (bookmakers + cells) with —.
   - If snapshot has data for the current market, fills cells.
   Snapshot shape supported (best-effort):
   A) snapshot.markets[marketKey][providerName] -> array of legs (objects)
   B) snapshot[marketKey][providerName] -> array of legs (objects)
   Each leg object may include: current, open, delta
============================================================ */
(function () {
  "use strict";

  var TARGETS = {
    greek: document.getElementById("greek-odds-body"),
    european: document.getElementById("eu-odds-body"),
    asian: document.getElementById("asian-odds-body"),
    betfair: document.getElementById("betfair-odds-body")
  };

  var PROVIDERS = {
    greek: ["Stoiximan", "Pamestoixima", "Novibet", "Betsson"],
    european: ["Unibet", "Bet365", "Bwin"],
    asian: ["Pinnacle", "SBOBET", "188Bet"],
    betfair: ["Betfair"]
  };

  var MARKET_LEGS = {
    "1X2": ["1", "X", "2"],
    "DC": ["1X", "12", "X2"],
    "GG": ["GG", "NG"],
    "OU15": ["Over 1.5", "Under 1.5"],
    "OU25": ["Over 2.5", "Under 2.5"],
    "OU35": ["Over 3.5", "Under 3.5"]
  };

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  function buildTable(sectionKey, market) {
    var container = TARGETS[sectionKey];
    if (!container) return;

    clear(container);

    var legs = MARKET_LEGS[market] || [];
    var table = el("div", "oic-odds-table");

    // header row
    var head = el("div", "oic-odds-header");
    head.appendChild(el("div", "oic-book", "")); // empty to avoid "Book" label artifact
    for (var i = 0; i < legs.length; i++) {
      head.appendChild(el("div", "oic-head", legs[i]));
    }
    table.appendChild(head);

    // bookmaker rows
    var books = PROVIDERS[sectionKey] || [];
    for (var b = 0; b < books.length; b++) {
      var row = el("div", "oic-odds-row");
      row.setAttribute("data-book", books[b]);

      row.appendChild(el("div", "oic-book", books[b]));

      for (var c = 0; c < legs.length; c++) {
        var cellWrap = el("div", "oic-odd-cell");
        var cur = el("div", "oic-odd-current", "—");
        var del = el("div", "oic-odd-delta", "—");
        cellWrap.appendChild(cur);
        cellWrap.appendChild(del);
        row.appendChild(cellWrap);
      }

      table.appendChild(row);
    }

    container.appendChild(table);
  }

  function readMarketBlock(snapshot, market) {
    if (!snapshot) return null;
    if (snapshot.markets && snapshot.markets[market]) return snapshot.markets[market];
    if (snapshot[market]) return snapshot[market];
    return null;
  }

  function format2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  function fillSection(sectionKey, market, snapshot) {
    var container = TARGETS[sectionKey];
    if (!container) return;

    var block = readMarketBlock(snapshot, market);
    if (!block) return;

    var rows = container.querySelectorAll(".oic-odds-row");
    for (var r = 0; r < rows.length; r++) {
      var book = rows[r].getAttribute("data-book") || "";
      var oddsArr = block[book];
      if (!oddsArr || !oddsArr.length) continue;

      var cells = rows[r].querySelectorAll(".oic-odd-cell");
      for (var i = 0; i < cells.length; i++) {
        var leg = oddsArr[i];
        if (!leg) continue;

        var cur = (leg.current != null) ? Number(leg.current) : (leg.c != null ? Number(leg.c) : NaN);
        var opn = (leg.open != null) ? Number(leg.open) : (leg.o != null ? Number(leg.o) : NaN);
        var dlt = (leg.delta != null) ? Number(leg.delta) : (isFinite(cur) && isFinite(opn) ? (cur - opn) : NaN);

        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");

        if (curEl) curEl.textContent = format2(cur);

        if (delEl) {
          if (isFinite(opn) && isFinite(dlt)) {
            var sign = dlt > 0 ? "+" : "";
            delEl.textContent = format2(opn) + " (" + sign + format2(dlt) + ")";
          } else if (isFinite(opn)) {
            delEl.textContent = format2(opn);
          } else {
            delEl.textContent = "—";
          }
        }
      }
    }
  }

  function renderAll(payload) {
    payload = payload || {};
    var market = payload.market || "1X2";
    var snapshot = payload.snapshot || null;

    // always build skeleton
    buildTable("greek", market);
    buildTable("european", market);
    buildTable("asian", market);
    buildTable("betfair", market);

    // fill if snapshot exists
    fillSection("greek", market, snapshot);
    fillSection("european", market, snapshot);
    fillSection("asian", market, snapshot);
    fillSection("betfair", market, snapshot);
  }

  window.OICRenderer = { renderAll: renderAll };
})();
