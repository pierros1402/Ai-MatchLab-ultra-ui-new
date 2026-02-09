(function () {
  "use strict";

  var TARGETS = {
    greek: document.getElementById("greek-odds-body"),
    european: document.getElementById("eu-odds-body"),
    asian: document.getElementById("asian-odds-body"),
    betfair: document.getElementById("betfair-odds-body")
  };

  // Greek stays curated
  var GREEK_PROVIDERS = ["Stoiximan", "Pamestoixima", "Novibet", "Betsson"];

  var MARKET_LEGS = {
    "1X2": ["1", "X", "2"],
    "DC": ["1X", "12", "X2"],
    "BTTS": ["GG", "NG"],
    "OU15": ["O1.5", "U1.5"],
    "OU25": ["O2.5", "U2.5"],
    "OU35": ["O3.5", "U3.5"]
  };

  function normalizeMarket(m) {
    if (!m) return "1X2";
    m = String(m).trim();
    if (MARKET_LEGS[m]) return m;
    if (m === "Double Chance") return "DC";
    if (m === "Over / Under 1.5") return "OU15";
    if (m === "Over / Under 2.5") return "OU25";
    if (m === "Over / Under 3.5") return "OU35";
    if (m.toUpperCase() === "GG") return "BTTS";
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

  function format2(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  function buildTable(container, books, marketKey) {
    if (!container) return;

    clear(container);

    var legs = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var table = el("div", "oic-odds-table");
    table.setAttribute("data-cols", String(legs.length));

    var head = el("div", "oic-odds-header");
    head.appendChild(el("div", "oic-book", ""));
    legs.forEach(function (l) {
      head.appendChild(el("div", "oic-head", l));
    });
    table.appendChild(head);

    books.forEach(function (book) {
      var row = el("div", "oic-odds-row");
      row.setAttribute("data-book", book);

      row.appendChild(el("div", "oic-book", book));

      legs.forEach(function () {
        var cellWrap = el("div", "oic-odd-cell");
        cellWrap.appendChild(el("div", "oic-odd-current", "—"));
        cellWrap.appendChild(el("div", "oic-odd-delta", "—"));
        row.appendChild(cellWrap);
      });

      table.appendChild(row);
    });

    container.appendChild(table);
  }

  function fillSection(container, books, marketKey, snapshot) {
    if (!container || !snapshot) return;

    var block = snapshot[marketKey] || snapshot;
    if (!block) return;

    books.forEach(function (book) {
      var oddsArr = block[book];
      if (!oddsArr) return;

      var row = container.querySelector('.oic-odds-row[data-book="' + book + '"]');
      if (!row) return;

      var cells = row.querySelectorAll(".oic-odd-cell");

      oddsArr.forEach(function (leg, i) {
        if (!cells[i]) return;

        var cur = Number(leg.current);
        var opn = Number(leg.open);
        var dlt = Number(leg.delta);

        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");

        if (curEl) curEl.textContent = format2(cur);

        if (delEl) {
          if (isFinite(opn) && isFinite(dlt)) {
            var sign = dlt > 0 ? "+" : "";
            delEl.textContent = format2(opn) + " (" + sign + format2(dlt) + ")";
          } else {
            delEl.textContent = "—";
          }
        }
      });
    });
  }

  function groupBooks(snapshot) {
    var allBooks = Object.keys(snapshot || {});

    var european = [];
    var asian = [];
    var betfair = [];

    allBooks.forEach(function (b) {
      if (/betfair/i.test(b)) {
        betfair.push(b);
      } else if (/pinnacle|sbobet|188bet/i.test(b)) {
        asian.push(b);
      } else {
        european.push(b);
      }
    });

    return {
      european: european,
      asian: asian,
      betfair: betfair
    };
  }

  function renderAll(payload) {
    payload = payload || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var snapshot = payload.snapshot || null;

    var grouped = groupBooks(snapshot || {});

    // Greek stays static
    buildTable(TARGETS.greek, GREEK_PROVIDERS, marketKey);
    fillSection(TARGETS.greek, GREEK_PROVIDERS, marketKey, snapshot);

    // Dynamic panels
    buildTable(TARGETS.european, grouped.european, marketKey);
    fillSection(TARGETS.european, grouped.european, marketKey, snapshot);

    buildTable(TARGETS.asian, grouped.asian, marketKey);
    fillSection(TARGETS.asian, grouped.asian, marketKey, snapshot);

    buildTable(TARGETS.betfair, grouped.betfair, marketKey);
    fillSection(TARGETS.betfair, grouped.betfair, marketKey, snapshot);
  }

  window.OICRenderer = { renderAll: renderAll };

})();
