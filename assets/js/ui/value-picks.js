/* ==========================================================================
   VALUE PICKS PANEL (UI)
   Path: assets/js/ui/value-picks.js

   Listens: value:update
   Payload: { ok, date, total, picks: [...] }

   Features:
   - Header toolbar filters (Market + League)
   - Full league names (LEAGUE_NAME_MAP from leagues.txt)
   - Score displayed as % (e.g. 64%)
   - Confidence visuals via CSS classes (LOW/MEDIUM/HIGH)
   - Hide PRE (show LIVE/FT only when present)
   ========================================================================== */

(function () {
  "use strict";

  const log = (...a) => console.log("[value-picks]", ...a);
  const warn = (...a) => console.warn("[value-picks]", ...a);

  // --------------------------------------------------------------------------
  // DOM
  // --------------------------------------------------------------------------
  const root =
    document.querySelector("#value-panel") ||
    document.querySelector("[data-panel='value']") ||
    document.querySelector(".value-panel") ||
    document.querySelector("#panel-value");

  if (!root) {
    warn("Value panel root not found");
    return;
  }

  const bodyEl =
    root.querySelector("#value-picks-list") ||
    root.querySelector(".panel-body") ||
    root.querySelector(".panel-content") ||
    root;


  // --------------------------------------------------------------------------
  // League map (FULL set, aligned with leagues.txt)
  // --------------------------------------------------------------------------
  const LEAGUE_NAME_MAP = {
    "eng.1":"Premier League",
    "eng.2":"Championship",
    "eng.3":"League One",
    "eng.4":"League Two",
    "eng.5":"National League",
    "eng.fa":"FA Cup",
    "eng.league_cup":"EFL Cup",
    "eng.trophy":"EFL Trophy",

    "esp.1":"LaLiga",
    "esp.2":"LaLiga 2",
    "esp.copa_del_rey":"Copa del Rey",
    "esp.super_cup":"Supercopa de España",
    "esp.w.1":"Liga F",

    "ita.1":"Serie A",
    "ita.2":"Serie B",
    "ita.coppa_italia":"Coppa Italia",

    "fra.1":"Ligue 1",
    "fra.2":"Ligue 2",
    "fra.coupe_de_france":"Coupe de France",
    "fra.super_cup":"Trophée des Champions",
    "fra.w.1":"Première Ligue",

    "ger.1":"Bundesliga",
    "ger.2":"2. Bundesliga",

    "sco.1":"Scottish Premiership",
    "sco.2":"Scottish Championship",
    "sco.challenge":"Scottish Challenge Cup",
    "sco.tennents":"Scottish Premiership",

    "ned.1":"Eredivisie",
    "ned.2":"Keuken Kampioen Divisie",
    "ned.3":"Tweede Divisie",
    "ned.cup":"KNVB Beker",

    "por.1":"Primeira Liga",
    "por.taca.portugal":"Taça de Portugal",

    "bel.1":"Belgian Pro League",

    "gre.1":"Super League Greece",
    "cyp.1":"Cypriot First Division",
    "ksa.1":"Saudi Pro League",

    "uefa.champions":"UEFA Champions League",
    "uefa.europa":"UEFA Europa League",
    "uefa.europa.conf":"UEFA Europa Conference League",

    "caf.nations":"Africa Cup of Nations",
    "caf.champions":"CAF Champions League",
    "caf.confed":"CAF Confederation Cup",

    "afc.champions":"AFC Champions League",
    "afc.cup":"AFC Cup",

    "mex.1":"Liga MX",
    "mex.2":"Liga de Expansión MX",
    "usa.1":"MLS",
    "usa.w.1":"NWSL",

    "arg.1":"Liga Profesional Argentina",
    "bra.1":"Brasileirão Série A",
    "bra.2":"Brasileirão Série B",
    "chi.1":"Primera División de Chile",
    "uru.1":"Uruguayan Primera División",
    "par.1":"Paraguayan Primera División",
    "per.1":"Peruvian Primera División",
    "ecu.1":"Ecuadorian Serie A",

    "crc.1":"Costa Rican Primera División",
    "gua.1":"Liga Nacional de Guatemala",
    "hon.1":"Liga Nacional de Honduras",
    "pan.1":"Liga Panameña de Fútbol",
    "jam.1":"Jamaica Premier League",
    "col.1":"Categoría Primera A",

    "tur.1":"Turkish Süper Lig",
    "sui.1":"Swiss Super League",
    "aut.1":"Austrian Bundesliga",
    "den.1":"Danish Superliga",
    "swe.1":"Allsvenskan",
    "nor.1":"Eliteserien",

    "sgp.1":"Singapore Premier League",
    "slv.1":"Primera División de El Salvador",
    "jpn.1":"J1 League",
    "kor.1":"K League 1",
    "chn.1":"Chinese Super League",
    "tha.1":"Thai League 1",
    "ind.1":"Indian Super League",
    "aus.1":"A-League Men",
    "aus.w.1":"A-League Women",

    "bra.camp.carioca":"Campeonato Carioca",
    "bra.camp.paulista":"Campeonato Paulista",
    "bra.camp.gaucho":"Campeonato Gaúcho",
    "bra.camp.mineiro":"Campeonato Mineiro",

    "club.friendly":"Club Friendly"
  };

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => {
      return ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[c];
    });
  }

  function normalizeMarket(m) {
    // We keep markets aligned with your global list.
    // Current worker outputs: "BTTS", "Over 2.5"
    const x = String(m || "").toLowerCase();

    if (x.includes("btts")) return "BTTS";

    // Over/Under family (future-proof)
    if (x.includes("over") && x.includes("1.5")) return "Over / Under 1.5";
    if (x.includes("over") && x.includes("2.5")) return "Over / Under 2.5";
    if (x.includes("over") && x.includes("3.5")) return "Over / Under 3.5";

    // fallback
    return (m || "").trim() || "—";
  }

  function marketShortLabel(m) {
    // Display labels inside sections (compact)
    if (m === "Over / Under 2.5") return "Over 2.5";
    if (m === "Over / Under 1.5") return "Over 1.5";
    if (m === "Over / Under 3.5") return "Over 3.5";
    return m;
  }

  function leagueLabel(p) {
    if (p?.leagueName && String(p.leagueName).trim()) return String(p.leagueName).trim();
    const slug = (p?.leagueSlug || "").trim();
    return LEAGUE_NAME_MAP[slug] || slug || "Unknown League";
  }

  function confidenceKey(c) {
    const x = String(c || "").toUpperCase();
    if (x === "HIGH") return "HIGH";
    if (x === "MEDIUM") return "MEDIUM";
    return "LOW";
  }

  function scoreToPct(score) {
    if (typeof score !== "number" || !Number.isFinite(score)) return "—";

    // Accept both 0..1 and 0..100 inputs
    let pct = score <= 1 ? score * 100 : score;

    // safety clamp
    pct = Math.max(0, Math.min(100, pct));

    return `${Math.round(pct)}%`;
  }


  function kickoffHHMM(ms) {
    if (!ms || typeof ms !== "number") return "";
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  let lastPayload = null;
  let selectedMarket = "ALL";
  let selectedLeague = "ALL";

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  function buildHeader(date, total, picks) {
  const markets = Array.from(
    new Set(picks.map((p) => normalizeMarket(p?.market)).filter(Boolean))
  ).sort();

  const leagues = Array.from(
    new Set(picks.map((p) => leagueLabel(p)).filter(Boolean))
  ).sort();

  const marketOptions = ["ALL", ...markets];
  const leagueOptions = ["ALL", ...leagues];

  const marketHtml = marketOptions.map((m) => {
    const sel = m === selectedMarket ? "selected" : "";
    const label = m === "ALL" ? "All Markets" : marketShortLabel(m);
    return `<option value="${esc(m)}" ${sel}>${esc(label)}</option>`;
  }).join("");

  const leagueHtml = leagueOptions.map((l) => {
    const sel = l === selectedLeague ? "selected" : "";
    const label = l === "ALL" ? "All Leagues" : l;
    return `<option value="${esc(l)}" ${sel}>${esc(label)}</option>`;
  }).join("");

  return `
    <div class="value-head">
      <div class="value-head-top">
        <div class="value-head-title">${esc(date)} • ${total} picks</div>
      </div>

      <div class="value-toolbar value-toolbar-compact">
        <select class="value-filter-market">${marketHtml}</select>
        <select class="value-filter-league">${leagueHtml}</select>
      </div>
    </div>
  `;
}


  function wireToolbar() {
    const marketSel = bodyEl.querySelector(".value-filter-market");
    const leagueSel = bodyEl.querySelector(".value-filter-league");

    if (marketSel) {
      marketSel.addEventListener("change", () => {
        selectedMarket = marketSel.value || "ALL";
        if (lastPayload) render(lastPayload);
      });
    }

    if (leagueSel) {
      leagueSel.addEventListener("change", () => {
        selectedLeague = leagueSel.value || "ALL";
        if (lastPayload) render(lastPayload);
      });
    }
  }

  
// ✅ Borderline LOW window per market (UI filter)
const LOW_MIN_BY_MARKET = {
  "BTTS": 0.54,
  "Over / Under 1.5": 0.58,
  "Over / Under 2.5": 0.54,
  "Over / Under 3.5": 0.46,
  "1X2": 0.55
};

// πόσο “οριακά” LOW κρατάμε (2%)
const LOW_WINDOW = 0.02;

function uiLowAllowed(p) {
  const conf = confidenceKey(p?.confidence);
  if (conf !== "LOW") return true;

  const m = normalizeMarket(p?.market);
  const lowMin = LOW_MIN_BY_MARKET[m];

  if (typeof lowMin !== "number") return false;

  const s = Number(p?.score);
  if (!Number.isFinite(s)) return false;

  return s >= lowMin && s < (lowMin + LOW_WINDOW);
}

function applyFilters(picks) {
    return picks.filter((p) => {
      const m = normalizeMarket(p?.market);
      const l = leagueLabel(p);

      if (selectedMarket !== "ALL" && m !== selectedMarket) return false;
      if (selectedLeague !== "ALL" && l !== selectedLeague) return false;

      if (!uiLowAllowed(p)) return false;
    return true;
    });
  }

  function groupByMarket(picks) {
    const g = {};
    for (const p of picks) {
      const m = normalizeMarket(p?.market);
      if (!g[m]) g[m] = [];
      g[m].push(p);
    }
    return g;
  }

  function sortPicks(picks) {
    const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return picks.slice().sort((a, b) => {
      const ca = rank[confidenceKey(a?.confidence)] || 0;
      const cb = rank[confidenceKey(b?.confidence)] || 0;
      if (cb !== ca) return cb - ca;
      const sa = Number(a?.score ?? 0);
      const sb = Number(b?.score ?? 0);
      return sb - sa;
    });
  }

  function renderRow(p) {
    const league = leagueLabel(p);
    const home = p?.home || "—";
    const away = p?.away || "—";

    const conf = confidenceKey(p?.confidence);
    const scorePct = scoreToPct(p?.score);

    const status = String(p?.status || "PRE").toUpperCase();

    // Hide PRE (noise). Keep LIVE/FT when they appear in future.
    let statusBadge = "";
    if (status === "LIVE") statusBadge = `<span class="value-badge live">LIVE</span>`;
    else if (status === "FT") statusBadge = `<span class="value-badge ft">FT</span>`;

    // If PRE, show kickoff time only if we have kickoff_ms
    const time = kickoffHHMM(p?.kickoff_ms);
    const timeHtml = time ? `<span class="value-time">${esc(time)}</span>` : "";

    return `
      <div class="value-row conf-${esc(conf.toLowerCase())}" data-match-id="${esc(p?.matchId || "")}">
        <div class="value-row-top">
          <div class="value-league">${esc(league)}</div>
          <div class="value-meta">
            ${timeHtml}
            ${statusBadge}
          </div>
        </div>

        <div class="value-row-mid">
          <div class="value-fixture">
            <span class="value-home">${esc(home)}</span>
            <span class="value-vs">vs</span>
            <span class="value-away">${esc(away)}</span>
          </div>
        </div>

        <div class="value-row-bot">
          <div class="value-score">${esc(scorePct)}</div>
          <div class="value-conf">${esc(conf)}</div>
        </div>
      </div>
    `;
  }

  function render(payload) {
    lastPayload = payload;

    const allPicks = Array.isArray(payload?.picks) ? payload.picks : [];
    const date = payload?.date || "";
    const total = typeof payload?.total === "number" ? payload.total : allPicks.length;

    if (!allPicks.length) {
      bodyEl.innerHTML = `
        <div class="value-head">
          <div class="value-head-top">
            <div class="value-head-title">Value Picks</div>
            <div class="value-head-sub">${esc(date)} • 0 picks</div>
          </div>
        </div>
        <div class="panel-empty">No value picks available.</div>
      `;
      return;
    }

    const headerHtml = buildHeader(date, total, allPicks);

    const filtered = applyFilters(allPicks);
    if (!filtered.length) {
      bodyEl.innerHTML = `
        ${headerHtml}
        <div class="panel-empty">No picks for selected filters.</div>
      `;
      wireToolbar();
      return;
    }

    // Group by market
    const groups = groupByMarket(filtered);
    const marketOrder = ["BTTS", "Over / Under 1.5", "Over / Under 2.5", "Over / Under 3.5", "1X2", "Double Chance"];

    const markets = Object.keys(groups).sort((a, b) => {
      const ia = marketOrder.indexOf(a);
      const ib = marketOrder.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    const sectionsHtml = markets.map((m) => {
      const picks = sortPicks(groups[m]);
      const rows = picks.map(renderRow).join("");

      return `
        <div class="value-section">
          <div class="value-section-title">${esc(marketShortLabel(m))}</div>
          <div class="value-list-inner">
            ${rows}
          </div>
        </div>
      `;
    }).join("");

    bodyEl.innerHTML = `
      ${headerHtml}
      <div class="value-sections">
        ${sectionsHtml}
      </div>
    `;

    wireToolbar();
    log("render", date, "picks=", filtered.length);
  }

  // --------------------------------------------------------------------------
  // EVENTS
  // --------------------------------------------------------------------------
  if (typeof window.on === "function") {
    window.on("value-picks:loaded", (payload) => {
      render({ date: payload?.date, picks: payload?.items || [], total: (payload?.items || []).length });
    });

  } else {
    warn("window.on not found (app.js not loaded first?)");
  }

})();
