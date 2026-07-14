(function () {
  "use strict";

  var TARGET_IDS = {
    greek: "greek-odds-body",
    european: "eu-odds-body",
    asian: "asian-odds-body",
    betfair: "betfair-odds-body"
  };

  var MARKET_LEGS = {
    "1X2": ["home", "draw", "away"],
    "HTFT": ["home", "draw", "away"],
    "BTTS": ["no", "yes"],
    "OU25": ["over", "under"],
    "OU15": ["over", "under"],
    "OU35": ["over", "under"],
    "DC": ["1X", "12", "X2"],
    "DNB": ["home", "away"]
  };

  var LEG_LABELS = {
    home: "1", draw: "X", away: "2",
    over: "O", under: "U",
    yes: "GG", no: "NG",
    "1X": "1X", "12": "12", "X2": "X2"
  };

  var GREEK_SET = {
    stoiximan: 1, vistabet: 1, "pamestoixima.gr": 1, pamestoixima: 1,
    betano: 1, novibet: 1, tzoker: 1, netbet: 1, winmasters: 1,
    interwetten: 1
  };

  var ASIAN_SET = {
    pinnacle: 1, sbobet: 1, "sbo bet": 1, singbet: 1, ps3838: 1,
    "3et": 1, dafabet: 1, kaiyun: 1, sharpbet: 1, "188bet": 1,
    maxbet: 1, ibcbet: 1, marathonbet: 1
  };

  var BETFAIR_SET = {
    betfair: 1, "betfair-ex": 1, "betfair exchange": 1,
    "betfair-spb": 1, "betfair sportsbook": 1,
    "betfair.es": 1, "betfair.it": 1
  };

  var PANEL_ALIASES = {
    greek: ["greek", "greece", "gr"],
    european: ["european", "europe", "eu"],
    asian: ["asian", "asia"],
    betfair: ["betfair", "exchange"]
  };

  var LAST_VALUES = {};
  var CHANGE_LOG = [];
  var MAX_LOG = 50;
  var META_KEYS = { open: 1, delta: 1, current: 1, opening: 1, panel: 1, group: 1 };
  var SKIP_KEYS = {
    Market: 1, market: 1, greek: 1, greece: 1, gr: 1,
    eu: 1, europe: 1, european: 1, asian: 1, asia: 1,
    betfair: 1, exchange: 1, bookmakers: 1, books: 1, rows: 1
  };

  function target(panel) {
    return document.getElementById(TARGET_IDS[panel]);
  }

  function normalizeBookName(book) {
    return String(book || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function classifyBook(book) {
    var lc = normalizeBookName(book);
    if (GREEK_SET[lc]) return "greek";
    if (ASIAN_SET[lc]) return "asian";
    if (BETFAIR_SET[lc] || lc.indexOf("betfair") === 0) return "betfair";
    return "european";
  }

  function normalizeMarket(m) {
    if (!m) return "1X2";
    var raw = String(m).trim();
    if (MARKET_LEGS[raw]) return raw;
    if (raw === "Double Chance") return "DC";
    if (raw === "Draw No Bet") return "DNB";
    if (raw === "Over / Under 1.5") return "OU15";
    if (raw === "Over / Under 2.5") return "OU25";
    if (raw === "Over / Under 3.5") return "OU35";
    if (raw.toUpperCase() === "GG" || raw.toUpperCase() === "BTTS") return "BTTS";
    return "1X2";
  }

  function clear(container) {
    while (container && container.firstChild) container.removeChild(container.firstChild);
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

  function findRow(container, book) {
    if (!container) return null;
    var rows = container.querySelectorAll(".oic-odds-row");
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute("data-book") === String(book)) return rows[i];
    }
    return null;
  }

  function buildTable(container, books, legs) {
    if (!container) return;
    clear(container);

    var table = el("div", "oic-odds-table");
    table.setAttribute("data-cols", String(legs.length));

    var head = el("div", "oic-odds-header");
    head.appendChild(el("div", "oic-book", ""));
    legs.forEach(function (leg) {
      head.appendChild(el("div", "oic-head", LEG_LABELS[leg] || leg));
    });
    table.appendChild(head);

    books.forEach(function (book) {
      var row = el("div", "oic-odds-row");
      row.setAttribute("data-book", book);
      row.appendChild(el("div", "oic-book", book));
      legs.forEach(function () {
        var wrap = el("div", "oic-odd-cell");
        wrap.appendChild(el("div", "oic-odd-current", "—"));
        wrap.appendChild(el("div", "oic-odd-delta", ""));
        row.appendChild(wrap);
      });
      table.appendChild(row);
    });

    container.appendChild(table);
  }

  function emptyPanel(container, msg) {
    if (!container) return;
    clear(container);
    container.appendChild(el("div", "oic-empty", msg || "—"));
  }

  function looksLikeOddsRecord(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    if (raw.current && typeof raw.current === "object") return true;
    var legs = ["home", "draw", "away", "over", "under", "yes", "no", "1X", "12", "X2"];
    return legs.some(function (leg) { return raw[leg] != null; });
  }

  function normalizeOddsRecord(raw) {
    if (!raw || typeof raw !== "object") return null;

    if (raw.current && typeof raw.current === "object" && !Array.isArray(raw.current)) {
      var out = Object.assign({}, raw.current);
      if (raw.open && typeof raw.open === "object") out.open = raw.open;
      else if (raw.opening && typeof raw.opening === "object") out.open = raw.opening;
      if (raw.delta && typeof raw.delta === "object") out.delta = raw.delta;
      return out;
    }

    return raw;
  }

  function addBook(groups, panel, book, rawOdds) {
    if (!book || !groups[panel]) return;
    var odds = normalizeOddsRecord(rawOdds);
    if (!odds) return;
    groups[panel][String(book)] = odds;
  }

  function addPanelContainer(groups, panel, value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(function (row) {
        if (!row || typeof row !== "object") return;
        var book = row.book || row.bookmaker || row.name || row.provider;
        addBook(groups, panel, book, row.odds || row.prices || row);
      });
      return;
    }

    if (typeof value !== "object") return;
    Object.keys(value).forEach(function (book) {
      addBook(groups, panel, book, value[book]);
    });
  }

  function normalizeMultiMarketData(raw) {
    var groups = { greek: {}, european: {}, asian: {}, betfair: {} };
    if (!raw) return groups;

    if (Array.isArray(raw)) {
      raw.forEach(function (row) {
        if (!row || typeof row !== "object") return;
        var book = row.book || row.bookmaker || row.name || row.provider;
        var panel = row.panel || row.group || row.bookGroup || classifyBook(book);
        if (panel === "eu") panel = "european";
        if (!groups[panel]) panel = classifyBook(book);
        addBook(groups, panel, book, row.odds || row.prices || row);
      });
      return groups;
    }

    if (typeof raw !== "object") return groups;

    var foundGrouped = false;
    Object.keys(PANEL_ALIASES).forEach(function (panel) {
      PANEL_ALIASES[panel].forEach(function (alias) {
        if (raw[alias] == null) return;
        if (looksLikeOddsRecord(raw[alias])) {
          // In a flat market, "betfair" can be the bookmaker name itself.
          if (panel === "betfair") addBook(groups, panel, alias, raw[alias]);
          return;
        }
        foundGrouped = true;
        addPanelContainer(groups, panel, raw[alias]);
      });
    });

    var booksBlock = raw.bookmakers || raw.books;
    if (booksBlock && typeof booksBlock === "object") {
      foundGrouped = true;
      Object.keys(booksBlock).forEach(function (book) {
        var rec = booksBlock[book];
        var panel = rec && (rec.panel || rec.group || rec.bookGroup);
        if (panel === "eu") panel = "european";
        if (!groups[panel]) panel = classifyBook(book);
        addBook(groups, panel, book, rec && (rec.odds || rec.prices) || rec);
      });
    }

    if (Array.isArray(raw.rows)) {
      foundGrouped = true;
      raw.rows.forEach(function (row) {
        if (!row || typeof row !== "object") return;
        var book = row.book || row.bookmaker || row.name || row.provider;
        var panel = row.panel || row.group || row.bookGroup;
        if (panel === "eu") panel = "european";
        if (!groups[panel]) panel = classifyBook(book);
        addBook(groups, panel, book, row.odds || row.prices || row);
      });
    }

    // Flat OddsPapi variant: { "bet365": {...}, "stoiximan": {...} }
    // This is the critical fallback that routes every bookmaker to its panel.
    if (!foundGrouped || Object.keys(raw).some(function (key) { return !SKIP_KEYS[key]; })) {
      Object.keys(raw).forEach(function (book) {
        var rec = raw[book];
        if (SKIP_KEYS[book] && !looksLikeOddsRecord(rec)) return;
        if (!rec || typeof rec !== "object" || Array.isArray(rec)) return;
        addBook(groups, classifyBook(book), book, rec);
      });
    }

    return groups;
  }

  function resolveMarketBlock(markets, marketKey) {
    if (!markets || typeof markets !== "object") return {};
    if (markets[marketKey]) return markets[marketKey];

    var keys = Object.keys(markets);
    for (var i = 0; i < keys.length; i++) {
      if (normalizeMarket(keys[i]) === marketKey) return markets[keys[i]];
    }

    // Some endpoints return a single market block directly rather than wrapping
    // it in { "1X2": ... }.
    if (keys.some(function (key) {
      return PANEL_ALIASES.greek.indexOf(key) >= 0
        || PANEL_ALIASES.european.indexOf(key) >= 0
        || PANEL_ALIASES.asian.indexOf(key) >= 0
        || PANEL_ALIASES.betfair.indexOf(key) >= 0;
    })) return markets;

    return {};
  }

  function fillAggregateSection(container, books, marketKey, snapshot, matchPayload) {
    if (!container || !snapshot) return;
    var block = snapshot[marketKey] || snapshot;
    if (!block) return;

    books.forEach(function (book) {
      var oddsArr = block[book];
      if (!Array.isArray(oddsArr)) return;
      var row = findRow(container, book);
      if (!row) return;
      var cells = row.querySelectorAll(".oic-odd-cell");

      oddsArr.forEach(function (leg, i) {
        if (!cells[i]) return;
        var cur = Number(leg.current);
        var opn = Number(leg.open);
        var dlt = Number(leg.delta);
        var key = (matchPayload.matchId || "") + "_" + book + "_" + i;
        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");

        if (curEl) curEl.textContent = isFinite(cur) ? fmt(cur) : "—";
        if (!delEl) return;

        if (isFinite(dlt)) {
          delEl.textContent = dlt === 0 ? "" : ((dlt > 0 ? "+" : "") + fmt(dlt));
          delEl.className = "oic-odd-delta" + (dlt > 0 ? " delta-up" : dlt < 0 ? " delta-down" : "");

          if (LAST_VALUES[key] !== cur) {
            LAST_VALUES[key] = cur;
            var change = {
              match: (matchPayload.home || "") + " – " + (matchPayload.away || ""),
              book: book, open: opn, current: cur, delta: dlt, ts: Date.now()
            };
            CHANGE_LOG.unshift(change);
            if (CHANGE_LOG.length > MAX_LOG) CHANGE_LOG.pop();
            if (window.emit) {
              window.emit("radar:update", [change]);
              window.emit("top-picks:update", CHANGE_LOG.slice().sort(function (a, b) {
                return Math.abs(b.delta) - Math.abs(a.delta);
              }));
            }
          }
        } else {
          delEl.textContent = "";
          delEl.className = "oic-odd-delta";
        }
      });
    });
  }

  function fillMultiSection(container, panelBooks, marketData, legKeys) {
    if (!container) return;

    panelBooks.forEach(function (book) {
      var row = findRow(container, book);
      if (!row) return;
      var odds = marketData && marketData[book];
      if (!odds) return;
      var cells = row.querySelectorAll(".oic-odd-cell");

      legKeys.forEach(function (leg, i) {
        if (!cells[i]) return;
        var curEl = cells[i].querySelector(".oic-odd-current");
        var delEl = cells[i].querySelector(".oic-odd-delta");
        var val = odds[leg];
        var delta = odds.delta && Number(odds.delta[leg]);
        var hasOpen = odds.open && odds.open[leg] != null;

        if (curEl) curEl.textContent = fmt(val);
        if (!delEl) return;

        if (isFinite(delta) && delta !== 0) {
          delEl.textContent = (delta > 0 ? "+" : "") + delta.toFixed(2);
          delEl.className = "oic-odd-delta " + (delta > 0 ? "delta-up" : "delta-down");
        } else {
          delEl.textContent = hasOpen ? "—" : "";
          delEl.className = "oic-odd-delta";
        }
      });
    });
  }

  function groupBooksAggregate(snapshot) {
    var block = snapshot && (snapshot["1X2"] || snapshot) || {};
    var groups = { greek: [], european: [], asian: [], betfair: [] };

    Object.keys(block).forEach(function (book) {
      if (!Array.isArray(block[book]) || SKIP_KEYS[book]) return;
      groups[classifyBook(book)].push(book);
    });

    Object.keys(groups).forEach(function (key) { groups[key].sort(); });
    return groups;
  }

  function getLegKeys(panelData, legDefs) {
    var books = Object.keys(panelData);
    if (!books.length) return legDefs;
    var sample = panelData[books[0]] || {};
    var fromData = Object.keys(sample).filter(function (key) {
      return !META_KEYS[key] && typeof sample[key] !== "object";
    });
    return fromData.length ? fromData : legDefs;
  }

  function highlightBestOdds(container, books, panelData, legs) {
    if (!container || !books.length) return;

    legs.forEach(function (leg, colIdx) {
      var best = -Infinity;
      books.forEach(function (book) {
        var value = Number(panelData[book] && panelData[book][leg]);
        if (isFinite(value) && value > best) best = value;
      });
      if (!isFinite(best)) return;

      var rows = container.querySelectorAll(".oic-odds-row");
      for (var i = 0; i < rows.length; i++) {
        var book = rows[i].getAttribute("data-book");
        var value = Number(panelData[book] && panelData[book][leg]);
        var cells = rows[i].querySelectorAll(".oic-odd-cell");
        var curEl = cells[colIdx] && cells[colIdx].querySelector(".oic-odd-current");
        if (!curEl) continue;
        curEl.classList.toggle("oic-best", isFinite(value) && value === best);
      }
    });
  }

  function renderAll(payload) {
    payload = payload || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var snapshot = payload.snapshot || null;
    var legs = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var grouped = groupBooksAggregate(snapshot || {});

    ["greek", "european", "asian", "betfair"].forEach(function (panel) {
      var container = target(panel);
      var books = grouped[panel];
      if (!books.length) {
        emptyPanel(container, payload.match ? "No odds" : "Select a match");
        return;
      }
      buildTable(container, books, legs);
      fillAggregateSection(container, books, marketKey, snapshot, payload);
    });
  }

  function renderMulti(payload) {
    payload = payload || {};
    var markets = payload.markets || {};
    var marketKey = normalizeMarket(payload.market || "1X2");
    var legDefs = MARKET_LEGS[marketKey] || MARKET_LEGS["1X2"];
    var rawMarketData = resolveMarketBlock(markets, marketKey);
    var grouped = normalizeMultiMarketData(rawMarketData);

    ["greek", "european", "asian", "betfair"].forEach(function (panel) {
      var container = target(panel);
      var panelData = grouped[panel] || {};
      var books = Object.keys(panelData).sort();
      if (!books.length) {
        emptyPanel(container, "No " + panel + " odds");
        return;
      }

      var legKeys = getLegKeys(panelData, legDefs);
      buildTable(container, books, legKeys);
      fillMultiSection(container, books, panelData, legKeys);
      if (marketKey === "1X2") highlightBestOdds(container, books, panelData, legKeys);
    });
  }

  window.OICRenderer = {
    renderAll: renderAll,
    renderMulti: renderMulti,
    classifyBook: classifyBook,
    normalizeMultiMarketData: normalizeMultiMarketData
  };

  if (typeof window.emit === "function") {
    window.emit("oic-renderer:ready", { ready: true });
  } else {
    window.dispatchEvent(new CustomEvent("oic-renderer:ready", { detail: { ready: true } }));
  }
})();
