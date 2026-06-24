(function () {
  "use strict";

  var TARGETS = {
    greek:    document.getElementById("greek-odds-body"),
    european: document.getElementById("eu-odds-body"),
    asian:    document.getElementById("asian-odds-body"),
    betfair:  document.getElementById("betfair-odds-body")
  };

  var MARKET_LEGS = {
    "1X2":  ["1", "X", "2"],
    "DC":   ["1X", "12", "X2"],
    "BTTS": ["GG", "NG"],
    "OU15": ["O1.5", "U1.5"],
    "OU25": ["O2.5", "U2.5"],
    "OU35": ["O3.5", "U3.5"]
  };

  // ─── Bookmaker classification (for aggregate/legacy snapshot) ──────────────
  var GREEK_SET   = { stoiximan:1, vistabet:1, "pamestoixima.gr":1, betano:1, novibet:1, tzoker:1 };
  var ASIAN_SET   = { pinnacle:1, sbobet:1, singbet:1, ps3838:1, "3et":1, dafabet:1, kaiyun:1, sharpbet:1, "188bet":1, maxbet:1, ibcbet:1 };
  var BETFAIR_SET = { "betfair-ex":1, "betfair-spb":1, "betfair.es":1, "betfair.it":1 };

  function classifyBook(b) {
    var lc = b.toLowerCase();
    if (GREEK_SET[lc]) return "greek";
    if (ASIAN_SET[lc]) return "asian";
    if (BETFAIR_SET[lc] || lc.startsWith("betfair")) return "betfair";
    return "european";
  }

  var LAST_VALUES = {};
  var CHANGE_LOG  = [];
  var MAX_LOG     = 50;

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
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, cls, txt) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  function fmt(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return x.toFixed(2);
  }

  // ─── Build empty table skeleton ────────────────────────────────────────────

  function buildTable(container, books, legs) {
    if (!container) return;
    clear(container);
    var table = el("div", "oic-odds-table");
    table.setAttribute("data-cols", String(legs.length));

    var head = el("div", "oic-odds-header");
    head.appendChild(el("div", "oic-book", ""));
    legs.forEach(function (l) { head.appendChild(el("div", "oic-head", l)); });
    table.appendChild(head);

    books.forEach(function (book) {
      var row = el("div", "oic-odds-row");
      row.setAttribute("data-book", book);
      row.appendChild(el("div", "oic-book", book));
      legs.forEach(function () {
        var wrap = el("div", "oic-odd-cell");
        wrap.appendChild(el("div", "oic-odd-current", "—"));
        wrap.appendChild(el("div", "oic-odd-delta",   "—"));
        row.appendChild(wrap);
      });
      table.appendChild(row);
    });

    container.appendChild(table);
  }

  function emptyPanel(container, msg) {
    if (!container) return;
    clear(container);
    var d = el("div", "oic-empty", msg || "—");
    container.appendChild(d);
  }

  // ─── Fill aggregate (legacy single-source) snapshot ───────────────────────

  function fillAggregateSection(container, books, marketKey, snapshot, matchPayload) {
    if (!container || !snapshot) return;
    var block = snapshot[marketKey] || snapshot;
    if (!block) return;

    books.forEach(function (book) {
      var oddsArr = block[book];
      if (!Array.isArray(oddsArr)) return;

      var row = container.querySelector('.oic-odds-row[data-book="' + book + '"]');
      if (!row) return;

      var cells = row.querySelectorAll(".oic-odd-cell");

      oddsArr.forEach(function (leg, i) {
        if (!cells[i]) return;
        var cur = Number(leg.current), opn = Number(leg.open), dlt = Number(leg.delta);
        var key = (matchPayload.matchId || "") + "_" + book + "_" + i;

        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");

        if (curEl) curEl.textContent = (isFinite(opn) && isFinite(cur)) ? fmt(opn) + "   " + fmt(cur) : "—";

        if (delEl) {
          if (isFinite(dlt)) {
            delEl.textContent = (dlt > 0 ? "+" : "") + fmt(dlt);
            if (LAST_VALUES[key] !== cur) {
              LAST_VALUES[key] = cur;
              var change = { match: (matchPayload.home || "") + " – " + (matchPayload.away || ""), book: book, open: opn, current: cur, delta: dlt, ts: Date.now() };
              CHANGE_LOG.unshift(change);
              if (CHANGE_LOG.length > MAX_LOG) CHANGE_LOG.pop();
              if (window.emit) {
                window.emit("radar:update", [change]);
                window.emit("top-picks:update", CHANGE_LOG.slice().sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }));
              }
            }
          } else {
            delEl.textContent = "—";
          }
        }
      });
    });
  }

  // ─── Fill multi-bookmaker snapshot (new OddsPapi format) ──────────────────
  // markets["1X2"][panel][bookmakerName] = { home, draw, away }

  function fillMultiSection(container, panelBooks, marketData, matchPayload, legKeys) {
    if (!container) return;

    panelBooks.forEach(function (book) {
      var row = container.querySelector('.oic-odds-row[data-book="' + book + '"]');
      if (!row) return;

      var odds = marketData && marketData[book];
      if (!odds) return;

      var cells = row.querySelectorAll(".oic-odd-cell");

      legKeys.forEach(function (leg, i) {
        if (!cells[i]) return;
        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");
        var val   = odds[leg];
        var dv    = odds.delta && odds.delta[leg];
        var hasOpen = odds.open && odds.open[leg] != null;

        if (curEl) curEl.textContent = fmt(val);

        if (delEl) {
          if (typeof dv === "number" && dv !== 0) {
            delEl.textContent = (dv > 0 ? "+" : "") + dv.toFixed(2);
            delEl.className   = "oic-odd-delta " + (dv > 0 ? "delta-up" : "delta-down");
          } else if (hasOpen) {
            delEl.textContent = "—";
            delEl.className   = "oic-odd-delta";
          } else {
            delEl.textContent = "";
            delEl.className   = "oic-odd-delta";
          }
        }
      });
    });
  }

  // ─── groupBooks for aggregate snapshot ────────────────────────────────────
  // Excludes generic/aggregate keys that are not real bookmakers.
  var SKIP_KEYS = { "Market": 1, "market": 1, "greek": 1, "eu": 1, "european": 1, "asian": 1, "betfair": 1 };

  function groupBooksAggregate(snapshot) {
    var block = snapshot && (snapshot["1X2"] || snapshot) || {};
    var groups = { greek: [], european: [], asian: [], betfair: [] };

    Object.keys(block).forEach(function (book) {
      if (!Array.isArray(block[book])) return;
      if (SKIP_KEYS[book]) return;
      groups[classifyBook(book)].push(book);
    });

    Object.keys(groups).forEach(function (k) { groups[k].sort(); });
    return groups;
  }

  // ─── renderAll — aggregate fallback ───────────────────────────────────────

  function renderAll(payload) {
    payload = payload || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var snapshot  = payload.snapshot || null;
    var legs      = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var grouped   = groupBooksAggregate(snapshot || {});

    ["greek", "european", "asian", "betfair"].forEach(function (panel) {
      var books = grouped[panel];
      if (!books.length) { emptyPanel(TARGETS[panel], "—"); return; }
      buildTable(TARGETS[panel], books, legs);
      if (snapshot) fillAggregateSection(TARGETS[panel], books, marketKey, snapshot, payload);
    });
  }

  // ─── Best odds highlighter ────────────────────────────────────────────────
  // Adds .oic-best class to the highest odds cell in each column per panel.

  function highlightBestOdds(container, books, panelData) {
    if (!container || !books.length) return;
    var legs = ["home", "draw", "away"];

    legs.forEach(function (leg, colIdx) {
      var best = -Infinity;
      books.forEach(function (book) {
        var v = panelData[book] && panelData[book][leg];
        if (typeof v === "number" && v > best) best = v;
      });
      if (!isFinite(best)) return;

      var rows = container.querySelectorAll(".oic-odds-row");
      rows.forEach(function (row) {
        var book = row.getAttribute("data-book");
        var v = panelData[book] && panelData[book][leg];
        var cells = row.querySelectorAll(".oic-odd-cell");
        var curEl = cells[colIdx] && cells[colIdx].querySelector(".oic-odd-current");
        if (!curEl) return;
        if (typeof v === "number" && v === best) {
          curEl.classList.add("oic-best");
        } else {
          curEl.classList.remove("oic-best");
        }
      });
    });
  }

  // ─── renderMulti — per-bookmaker OddsPapi data ────────────────────────────

  // Derive leg keys from the first bookmaker's odds object (generic — works for
  // 1X2, DC, OU25, etc.) filtering out meta keys like 'open' and 'delta'.
  var META_KEYS = { open: 1, delta: 1 };
  function getLegKeys(panelData, legDefs) {
    var books = Object.keys(panelData);
    if (!books.length) return legDefs;
    var sample = panelData[books[0]] || {};
    var fromData = Object.keys(sample).filter(function (k) { return !META_KEYS[k]; });
    return fromData.length ? fromData : legDefs;
  }

  function renderMulti(payload) {
    payload = payload || {};
    var markets   = payload.markets || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var legDefs   = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var mdata     = markets[marketKey] || {};

    ["greek", "european", "asian", "betfair"].forEach(function (panel) {
      var panelData = mdata[panel] || {};
      var books     = Object.keys(panelData).sort();
      if (!books.length) { emptyPanel(TARGETS[panel], "—"); return; }
      var legKeys = getLegKeys(panelData, legDefs);
      buildTable(TARGETS[panel], books, legKeys);
      fillMultiSection(TARGETS[panel], books, panelData, payload, legKeys);
      if (marketKey === "1X2") highlightBestOdds(TARGETS[panel], books, panelData);
    });
  }

  window.OICRenderer = { renderAll: renderAll, renderMulti: renderMulti };

})();
