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
  let root = null;
  let headWrapEl = null;
  let bodyEl = null;

  function isVisibleNode(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return Boolean(
      el.isConnected &&
      rect.width > 0 &&
      rect.height > 0 &&
      window.getComputedStyle(el).display !== "none" &&
      window.getComputedStyle(el).visibility !== "hidden"
    );
  }

  function resolveValueRoot() {
    const candidates = Array.from(document.querySelectorAll([
      "#right-panel .intelligence-panel.value-panel",
      "aside#right-panel .intelligence-panel.value-panel",
      ".right-column .intelligence-panel.value-panel",
      ".intelligence-panel.value-panel",
      "#value-panel",
      "[data-panel='value']",
      ".value-panel",
      "#panel-value"
    ].join(",")));

    const visible = candidates.find(isVisibleNode);
    if (visible) return visible;

    return candidates.find((el) => el?.isConnected) || null;
  }

  function resolveDomRefs() {
    const nextRoot = resolveValueRoot();

    if (!nextRoot) {
      warn("Value panel root not found");
      return false;
    }

    root = nextRoot;
    headWrapEl = root.querySelector(".value-head-wrap") || null;

    bodyEl =
      root.querySelector("#value-picks-list") ||
      root.querySelector(".value-picks-list") ||
      root.querySelector(".panel-body") ||
      root;

    if (!bodyEl) {
      warn("Value panel body not found");
      return false;
    }

    return true;
  }

  if (!resolveDomRefs()) {
    return;
  }

  log("root found", root);
  console.log("[value-picks] root rect", root.getBoundingClientRect());

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


  function hideAnalyzingIfHasPicks(total) {
  try {
    const panel = document.querySelector('#right-panel .intelligence-panel.value-panel') || document.querySelector('.intelligence-panel.value-panel');
    if (!panel) return;

    const ph = panel.querySelector('.panel-placeholder');
    if (!ph) return;

    if (total && total > 0) {
      ph.style.display = "none";
    } else {
      ph.style.display = "";
    }
  } catch (_) {}
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
  function marketFromPick(p) {
    const marketRaw =
      p?.market ??
      p?.marketName ??
      p?.pick ??
      "";

    return normalizeMarket(marketRaw);
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
    const n = Number(score);
    if (!Number.isFinite(n)) return "—";

    let pct = n <= 1 ? n * 100 : n;
    pct = Math.max(0, Math.min(100, pct));

    return `${Math.round(pct)}%`;
  }


  function resolveKickoffMs(p) {
    if (typeof p?.kickoff_ms === "number" && Number.isFinite(p.kickoff_ms)) {
      return p.kickoff_ms;
    }

    const raw =
      p?.kickoff ||
      p?.kickoffUtc ||
      p?.startTime ||
      p?.startUtc ||
      p?.time ||
      "";

    if (!raw) return null;

    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
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
      new Set(picks.map((p) => marketFromPick(p)).filter(Boolean))
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
        <div class="value-head-row">
          <div class="value-head-title">${esc(date)} • ${total} picks</div>
          <div class="value-toolbar">
            <select class="value-filter-market">${marketHtml}</select>
            <select class="value-filter-league">${leagueHtml}</select>
          </div>
        </div>
      </div>
    `;
  }


  function wireToolbar() {
    const scope = headWrapEl || bodyEl;
    const marketSel = scope.querySelector(".value-filter-market");
    const leagueSel = scope.querySelector(".value-filter-league");

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

function applyFilters(picks) {
  return picks.filter((p) => {
    const m = marketFromPick(p);
    const l = leagueLabel(p);

    // ---------------------------
    // MARKET FILTER (normalized)
    // ---------------------------
    if (selectedMarket !== "ALL") {
      const mm = String(m).trim().toLowerCase();
      const sm = String(selectedMarket).trim().toLowerCase();

      const map = {
        "over 1.5": "over / under 1.5",
        "over 2.5": "over / under 2.5",
        "over 3.5": "over / under 3.5"
      };

      const smNorm = map[sm] || sm;

      if (mm !== smNorm) return false;
    }

    // ---------------------------
    // LEAGUE FILTER (safe match)
    // ---------------------------
    if (
      selectedLeague !== "ALL" &&
      String(l).trim().toLowerCase() !== String(selectedLeague).trim().toLowerCase()
    ) {
      return false;
    }

    return true;
  });
}

function groupByMarket(picks) {
  const g = {};
  for (const p of picks) {
    const m = marketFromPick(p);
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

    const sa = Number(a?.confidenceValue ?? a?.score ?? 0);
    const sb = Number(b?.confidenceValue ?? b?.score ?? 0);
    if (sb !== sa) return sb - sa;

    return String(a?.home || "").localeCompare(String(b?.home || ""));
  });
}

function renderRow(p) {
  const league = leagueLabel(p);
  const home = p?.home ?? p?.homeTeam ?? "—";
  const away = p?.away ?? p?.awayTeam ?? "—";

  const market = marketFromPick(p);

  function pickBandForMarket(row, marketName) {
    if (typeof row?.band === "string") return confidenceKey(row.band);

    if (row?.band && typeof row.band === "object") {
      if (marketName === "Over / Under 1.5") return confidenceKey(row.band.over15);
      if (marketName === "Over / Under 2.5") return confidenceKey(row.band.over25);
      if (marketName === "Over / Under 3.5") return confidenceKey(row.band.over35);
      if (marketName === "BTTS") return confidenceKey(row.band.btts);
    }

    return confidenceKey(row?.confidence);
  }

  const conf = pickBandForMarket(p, market);
  const scorePct = scoreToPct(
    typeof p?.score === "number"
      ? p.score
      : p?.confidenceValue
  );

  const status = String(p?.status || "PRE").toUpperCase();
  const result = String(p?.result || "").toUpperCase();

  let statusBadge = "";
  if (status === "LIVE") statusBadge = `<span class="value-badge live">LIVE</span>`;
  else if (status === "FT") statusBadge = `<span class="value-badge ft">FT</span>`;

  let resultBadge = "";
  if (result === "WIN") {
    resultBadge = `<span class="value-badge win">WIN</span>`;
  } else if (result === "LOSS") {
    resultBadge = `<span class="value-badge loss">LOSS</span>`;
  }

  const kickoffMs = resolveKickoffMs(p);

  const time = kickoffHHMM(kickoffMs);
  const timeHtml = time ? `<span class="value-time">${esc(time)}</span>` : "";

  const marketLabel = marketShortLabel(market);
  const pickLabel =
    String(p?.pick || "").trim() ||
    marketLabel ||
    "—";
  return `
    <div class="value-row conf-${esc(conf.toLowerCase())}" data-match-id="${esc(p?.matchId || "")}" data-pick="${esc(pickLabel)}">
      <div class="value-row-top">
        <div class="value-league">${esc(league)}</div>
        <div class="value-meta">
          ${timeHtml}
          ${statusBadge}
          ${resultBadge}
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
        <div class="value-score">
          <span class="value-score-pct">${esc(scorePct)}</span>
          <span class="value-score-pick">${esc(pickLabel)}</span>
        </div>
        <div class="value-conf">${esc(conf)}</div>
      </div>
    </div>
  `;
}

function comparisonPlan(plans, key) {
  return plans && plans[key] ? plans[key] : {};
}

function resultBadgeHtml(result) {
  const r = String(result || "").toUpperCase();
  if (r === "WIN") return '<span class="value-badge win">WIN</span>';
  if (r === "LOSS") return '<span class="value-badge loss">LOSS</span>';
  // Before the match is played (UNRESOLVED) or non-settleable (UNSUPPORTED),
  // show a neutral dash — no negative-looking badge until there's an FT result.
  return '<span class="value-badge pending">—</span>';
}

function hitRateLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n * 100)) + "%";
}

function comparisonMarketLabel(p) {
  const market = String(p?.market || p?.marketName || "").toUpperCase();
  if (market === "OU15") return "Over / Under 1.5";
  if (market === "OU25") return "Over / Under 2.5";
  if (market === "OU35") return "Over / Under 3.5";
  if (market === "BTTS") return "BTTS";
  return p?.market || p?.marketName || "—";
}

function comparisonPickLabel(p) {
  const market = String(p?.market || p?.marketName || "").toUpperCase();
  const pick = String(p?.pick || p?.selection || p?.prediction || "").trim();
  const pickUpper = pick.toUpperCase();

  if (market === "OU15" && pickUpper === "OVER") return "Over 1.5";
  if (market === "OU15" && pickUpper === "UNDER") return "Under 1.5";
  if (market === "OU25" && pickUpper === "OVER") return "Over 2.5";
  if (market === "OU25" && pickUpper === "UNDER") return "Under 2.5";
  if (market === "OU35" && pickUpper === "OVER") return "Over 3.5";
  if (market === "OU35" && pickUpper === "UNDER") return "Under 3.5";
  if (market === "BTTS" && pickUpper === "YES") return "BTTS Yes";
  if (market === "BTTS" && pickUpper === "NO") return "BTTS No";

  return pick || "—";
}

function comparisonScoreLabel(p) {
  const parts = [];
  if (typeof p?.score === "number") parts.push(scoreToPct(p.score));
  if (p?.finalScore?.scoreKey) parts.push("FT " + p.finalScore.scoreKey);
  return parts.length ? parts.join(" • ") : "—";
}

function renderComparisonRow(p) {
  const country = String(p?.country || "").trim();
  const league = String(p?.leagueName || leagueLabel(p) || "").trim();
  const countryLeague = [country, league].filter(Boolean).join(" • ") || "Unknown League";
  const home = p?.homeTeam || p?.home || "—";
  const away = p?.awayTeam || p?.away || "—";
  const conf = confidenceKey(p?.band || p?.confidence);
  const pick = comparisonPickLabel(p);
  const resultBadge = resultBadgeHtml(p?.result);

  // Kickoff time (HH:MM)
  const kickoffMs = resolveKickoffMs(p);

  const time = kickoffHHMM(kickoffMs);
  const timeHtml = time ? '<span class="value-time">' + esc(time) + '</span>' : "";

  // Decimal odd for the pick (AI-priced fair odd from odds.json until a real
  // bookmaker feed is wired). Shown next to the pick, e.g. "@1.48".
  const oddVal = (typeof p?.oddsDecimal === "number" && p.oddsDecimal > 1)
    ? p.oddsDecimal.toFixed(2)
    : null;
  const mktHtml = oddVal ? '<span class="value-mkt">@' + esc(oddVal) + '</span>' : "";

  return [
    '<div class="value-row value-compare-row conf-' + esc(String(conf).toLowerCase()) + '" data-match-id="' + esc(p?.matchId || "") + '">',
    '  <div class="value-row-top">',
    '    <div class="value-league">' + esc(countryLeague) + '</div>',
    '    <div class="value-meta">' + timeHtml + resultBadge + '</div>',
    '  </div>',
    '  <div class="value-row-mid">',
    '    <div class="value-fixture">',
    '      <span class="value-home">' + esc(home) + '</span>',
    '      <span class="value-vs">vs</span>',
    '      <span class="value-away">' + esc(away) + '</span>',
    '    </div>',
    '  </div>',
    '  <div class="value-row-bot">',
    '    <div class="value-score">',
    '      <span class="value-score-pct">' + esc(comparisonScoreLabel(p)) + '</span>',
    '      <span class="value-score-pick">' + esc(pick) + '</span>',
    '      ' + mktHtml,
    '    </div>',
    '    <div class="value-conf">' + esc(conf) + '</div>',
    '  </div>',
    '</div>'
  ].join("");
}

function renderPlanSummary(summary) {
  return String(Number(summary?.picks || 0)) + " picks • " +
    String(Number(summary?.settled || 0)) + " settled • " +
    String(Number(summary?.wins || 0)) + "W-" +
    String(Number(summary?.losses || 0)) + "L • Hit " +
    hitRateLabel(summary?.hitRate);
}

function renderPlanBlock(plan, title) {
  const picks = Array.isArray(plan?.picks) ? plan.picks : [];
  const rows = picks.map(renderComparisonRow).join("");

  return [
    '<div class="value-plan-card">',
    '  <div class="value-plan-title">' + esc(title) + '</div>',
    '  <div class="value-plan-summary">' + esc(renderPlanSummary(plan?.summary || {})) + '</div>',
    '  <div class="value-plan-rows">',
    rows || '<div class="panel-empty">No picks.</div>',
    '  </div>',
    '</div>'
  ].join("");
}

function renderPlanComparison(payload) {
  if (!resolveDomRefs()) return;

  lastPayload = payload;

  const comparison = payload?.comparison || {};
  const planA = comparisonPlan(comparison.plans, "A");
  const planB = comparisonPlan(comparison.plans, "B");
  const date = comparison?.date || payload?.date || "";
  const totalA = Number(planA?.summary?.picks || 0);
  const totalB = Number(planB?.summary?.picks || 0);

  const headerHtml = [
    '<div class="value-head value-compare-head">',
    '  <div class="value-head-row">',
    '    <div>',
    '      <div class="value-head-title">' + esc(date) + ' • Plan A/B comparison</div>',
    '      <div class="value-head-sub">Plan A ' + esc(totalA) + ' picks • Plan B ' + esc(totalB) + ' picks</div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join("");

  const bodyHtml = [
    '<div class="value-plan-compare">',
    renderPlanBlock(planA, "Plan A - current UI value"),
    renderPlanBlock(planB, "Plan B - strict value-policy-v2.3 observation"),
    '</div>'
  ].join("");

  if (headWrapEl) {
    headWrapEl.innerHTML = headerHtml;
    bodyEl.innerHTML = bodyHtml;
  } else {
    bodyEl.innerHTML = headerHtml + bodyHtml;
  }

  hideAnalyzingIfHasPicks(totalA + totalB);
  window.AIML_PANEL?.set(root, "data");

  console.log("[value-picks] comparison render:html-written", {
    date,
    planA: totalA,
    planB: totalB,
    htmlLength: bodyEl.innerHTML.length
  });
}

  function render(payload) {
    if (!resolveDomRefs()) return;

    console.log("[value-picks] render:start", payload);
  //window.AIML_PANEL?.set(root, "loading", "Loading value picks...");
    lastPayload = payload;

    if (payload?.comparison?.plans?.A && payload?.comparison?.plans?.B) {
      renderPlanComparison(payload);
      return;
    }

    const allPicks = Array.isArray(payload?.picks) ? payload.picks : [];
    const date = payload?.date || "";
    const total = typeof payload?.total === "number" ? payload.total : allPicks.length;

    

    if (!allPicks.length) {
      if (headWrapEl) {
        headWrapEl.innerHTML = `
          <div class="value-head">
            <div class="value-head-top">
              <div class="value-head-title">Value Picks</div>
              <div class="value-head-sub">${esc(date)} • 0 picks</div>
            </div>
          </div>
        `;
      }
      bodyEl.innerHTML = `<div class="panel-empty">No value picks available.</div>`;
      hideAnalyzingIfHasPicks(0);
      window.AIML_PANEL?.set(root, "empty", "No value picks available.");
      return;
    }

    const headerHtml = buildHeader(date, total, allPicks);

    const filtered = applyFilters(allPicks);
if (!filtered.length) {
  if (headWrapEl) {
    headWrapEl.innerHTML = headerHtml;
    bodyEl.innerHTML = `<div class="panel-empty">No picks for selected filters.</div>`;
  } else {
    bodyEl.innerHTML = `
      ${headerHtml}
      <div class="panel-empty">No picks for selected filters.</div>
    `;
  }

  window.AIML_PANEL?.set(root, "data");
  hideAnalyzingIfHasPicks(total);
  wireToolbar();
  log("render", date, "picks=", filtered.length);
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

    if (headWrapEl) {
      headWrapEl.innerHTML = headerHtml;
      bodyEl.innerHTML = `
        <div class="value-sections">
          ${sectionsHtml}
        </div>
      `;
    } else {
      bodyEl.innerHTML = `
        ${headerHtml}
        <div class="value-sections">
          ${sectionsHtml}
        </div>
      `;
    }

    wireToolbar();
    if (bodyEl) {
      bodyEl.style.minHeight = "200px";
    }
    console.log("[value-picks] render:html-written", {
      total,
      filtered: filtered.length,
      bodyTag: bodyEl?.tagName,
      bodyClass: bodyEl?.className || "",
      bodyId: bodyEl?.id || "",
      htmlLength: bodyEl.innerHTML.length
    });

    setTimeout(() => {
      window.AIML_PANEL?.set(root, "data");
    }, 0);
   }
  // --------------------------------------------------------------------------
  // EVENTS
  // --------------------------------------------------------------------------
  if (typeof window.on === "function") {

    function toRenderPayload(payload) {
      const picks = payload?.picks || payload?.items || [];
      const total =
        typeof payload?.total === "number"
          ? payload.total
          : (Array.isArray(picks) ? picks.length : 0);

      return {
        ok: payload?.ok !== false,
        date: payload?.date || "",
        total,
        picks,
        source: payload?.source || "",
        mode: payload?.mode || "",
        comparison: payload?.comparison || null
      };
    }

    // Primary (from value-adapter.js)
    window.on("value:update", (payload) => {
      console.log("[value-picks] value:update received", payload);
      render(toRenderPayload(payload));
    });

    // Backward compatibility (older emitters)
    window.on("value-picks:loaded", (payload) => {
      render(toRenderPayload(payload));
    });

    // Replay the latest value payload if value-adapter emitted before this panel loaded.
    if (window.__AIML_LAST_VALUE) {
      console.log("[value-picks] replay latest value payload", {
        date: window.__AIML_LAST_VALUE.date,
        total: window.__AIML_LAST_VALUE.total,
        ageMs: Date.now() - (window.__AIML_LAST_VALUE_AT || Date.now())
      });

      setTimeout(() => {
        render(toRenderPayload(window.__AIML_LAST_VALUE));
      }, 0);
    }

  } else {
    warn("window.on not found (app.js not loaded first?)");
  }

})();