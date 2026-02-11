(function () {
  "use strict";

  var TARGETS = {
    greek: document.getElementById("greek-odds-body"),
    european: document.getElementById("eu-odds-body"),
    asian: document.getElementById("asian-odds-body"),
    betfair: document.getElementById("betfair-odds-body")
  };

  var MARKET_LEGS = {
    "1X2": ["1", "X", "2"],
    "DC": ["1X", "12", "X2"],
    "BTTS": ["GG", "NG"],
    "OU15": ["O1.5", "U1.5"],
    "OU25": ["O2.5", "U2.5"],
    "OU35": ["O3.5", "U3.5"]
  };

  var LAST_VALUES = {};
  var CHANGE_LOG = [];
  var MAX_LOG = 50;

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

  function fillSection(container, books, marketKey, snapshot, payload) {
    if (!container || !snapshot) return;

    var block = snapshot[marketKey] || snapshot;
    if (!block) return;

    var latestChronological = null;

    books.forEach(function (book) {

      var oddsArr = block[book];
      if (!Array.isArray(oddsArr)) return;

      var row = container.querySelector('.oic-odds-row[data-book="' + book + '"]');
      if (!row) return;

      var cells = row.querySelectorAll(".oic-odd-cell");

      oddsArr.forEach(function (leg, i) {
        if (!cells[i]) return;

        var cur = Number(leg.current);
        var opn = Number(leg.open);
        var dlt = Number(leg.delta);

        var key = (payload.matchId || "") + "_" + book + "_" + i;

        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");

        if (curEl) {
          if (isFinite(opn) && isFinite(cur)) {
            curEl.textContent = format2(opn) + "   " + format2(cur);
          } else {
            curEl.textContent = "—";
          }
        }

        if (delEl) {
          if (isFinite(dlt)) {
            var sign = dlt > 0 ? "+" : "";
            delEl.textContent = sign + format2(dlt);

            if (LAST_VALUES[key] !== cur) {
              LAST_VALUES[key] = cur;

              var change = {
                match: (payload.home || "") + " – " + (payload.away || ""),
                book: book,
                open: opn,
                current: cur,
                delta: dlt,
                ts: Date.now()
              };

              CHANGE_LOG.unshift(change);
              if (CHANGE_LOG.length > MAX_LOG) CHANGE_LOG.pop();

              latestChronological = change;
            }

          } else {
            delEl.textContent = "—";
          }
        }
      });
    });

    if (latestChronological && window.emit) {
      window.emit("radar:update", [latestChronological]);

      var sorted = CHANGE_LOG.slice().sort(function (a, b) {
        return Math.abs(b.delta) - Math.abs(a.delta);
      });

      window.emit("top-picks:update", sorted);
    }
  }

  function groupBooks(snapshot) {
    var marketKey = normalizeMarket("1X2");
    var block = snapshot && (snapshot[marketKey] || snapshot) || {};

    var greek = [];
    var european = [];
    var asian = [];
    var betfair = [];
    var unibetAdded = false;

    Object.keys(block).forEach(function (book) {
      if (!Array.isArray(block[book])) return;

      var b = book.toLowerCase();

      if (
        b.includes("betsson") ||
        b.includes("bet365") ||
        b.includes("bwin") ||
        b.includes("sportingbet")
      ) {
        greek.push(book);
        return;
      }

      if (b.includes("unibet")) {
        if (!unibetAdded) {
          greek.push("Unibet");
          unibetAdded = true;
        }
        return;
      }

      if (b.includes("pinnacle")) {
        asian.push(book);
        return;
      }

      if (b.includes("betfair")) {
        betfair.push(book);
        return;
      }

      european.push(book);
    });

    return {
      greek: greek.sort(),
      european: european.sort(),
      asian: asian.sort(),
      betfair: betfair.sort()
    };
  }

  function renderAll(payload) {
    payload = payload || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var snapshot = payload.snapshot || null;

    var grouped = groupBooks(snapshot || {});

    buildTable(TARGETS.greek, grouped.greek, marketKey);
    fillSection(TARGETS.greek, grouped.greek, marketKey, snapshot, payload);

    buildTable(TARGETS.european, grouped.european, marketKey);
    fillSection(TARGETS.european, grouped.european, marketKey, snapshot, payload);

    buildTable(TARGETS.asian, grouped.asian, marketKey);
    fillSection(TARGETS.asian, grouped.asian, marketKey, snapshot, payload);

    buildTable(TARGETS.betfair, grouped.betfair, marketKey);
    fillSection(TARGETS.betfair, grouped.betfair, marketKey, snapshot, payload);
  }

  window.OICRenderer = { renderAll: renderAll };

})();