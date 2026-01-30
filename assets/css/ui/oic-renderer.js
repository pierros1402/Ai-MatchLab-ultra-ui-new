/* ============================================================
   OIC RENDERER — LOCKED (odds.css compatible) ✅ FINAL
   Targets:
   - #greek-odds-body
   - #eu-odds-body
   - #asian-odds-body
   - #betfair-odds-body

   Behavior:
   - Always renders skeleton tables (bookmakers + cells) with —.
   - Accepts dropdown keys (1X2, DC, BTTS, OU15, OU25, OU35)
     AND also accepts legacy labels ("Over / Under 2.5") safely.
   - Renders correct header legs per market.
   - If snapshot has data for the current market, fills cells (best-effort).
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

  // ✅ legs per market (BTTS key, NOT GG)
  var MARKET_LEGS = {
    "1X2": ["1", "X", "2"],
    "DC": ["1X", "12", "X2"],
    "BTTS": ["GG", "NG"],
    "OU15": ["O1.5", "U1.5"],
    "OU25": ["O2.5", "U2.5"],
    "OU35": ["O3.5", "U3.5"]
  };

  function normalizeMarket(marketInput) {
    if (!marketInput) return "1X2";

    var m = String(marketInput).trim();

    // ✅ dropdown keys
    if (m === "1X2") return "1X2";
    if (m === "DC") return "DC";
    if (m === "BTTS") return "BTTS";
    if (m === "OU15") return "OU15";
    if (m === "OU25") return "OU25";
    if (m === "OU35") return "OU35";

    // ✅ legacy labels (if any code still sends labels)
    if (m === "Double Chance") return "DC";
    if (m === "BTTS") return "BTTS";
    if (m === "Over / Under 1.5") return "OU15";
    if (m === "Over / Under 2.5") return "OU25";
    if (m === "Over / Under 3.5") return "OU35";

    // ✅ tolerate GG legacy
    var up = m.toUpperCase();
    if (up === "GG") return "BTTS";

    // ✅ tolerate OU variants
    if (up === "OU1.5" || up === "OU_15") return "OU15";
    if (up === "OU2.5" || up === "OU_25") return "OU25";
    if (up === "OU3.5" || up === "OU_35") return "OU35";

    return "1X2";
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  function buildTable(sectionKey, marketKey) {
    var container = TARGETS[sectionKey];
    if (!container) return;

    clear(container);

    var legs = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var table = el("div", "oic-odds-table");
    table.setAttribute("data-cols", String(legs.length));

    // header row
    var head = el("div", "oic-odds-header");
    head.appendChild(el("div", "oic-book", ""));
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

  function readMarketBlock(snapshot, marketKey) {
    if (!snapshot) return null;

    // allow: snapshot.markets[marketKey] or snapshot[marketKey]
    if (snapshot.markets && snapshot.markets[marketKey]) return snapshot.markets[marketKey];
    if (snapshot[marketKey]) return snapshot[marketKey];

    // tolerate legacy GG storage
    if (marketKey === "BTTS") {
      if (snapshot.markets && snapshot.markets.GG) return snapshot.markets.GG;
      if (snapshot.GG) return snapshot.GG;
    }

    return null;
  }

  function format2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  function fillSection(sectionKey, marketKey, snapshot) {
    var container = TARGETS[sectionKey];
    if (!container) return;

    var block = readMarketBlock(snapshot, marketKey);
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
    var marketKey = normalizeMarket(payload.market || "1X2");
    var snapshot = payload.snapshot || null;

    buildTable("greek", marketKey);
    buildTable("european", marketKey);
    buildTable("asian", marketKey);
    buildTable("betfair", marketKey);

    fillSection("greek", marketKey, snapshot);
    fillSection("european", marketKey, snapshot);
    fillSection("asian", marketKey, snapshot);
    fillSection("betfair", marketKey, snapshot);
  }

  window.OICRenderer = { renderAll: renderAll };

  document.addEventListener("DOMContentLoaded", function () {
    try { renderAll({ market: "1X2", snapshot: null }); } catch (_) {}
  });
})();
