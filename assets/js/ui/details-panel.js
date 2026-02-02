/* ============================================================
   assets/js/ui/details-panel.js (FULL LINKED v1.7.4)
   - Worker-backed Details loader:
       /match-summary?league=<slug>&event=<id>
       /standings?league=<slug>
   - Theme aware (uses CSS vars if present)
   - Standings cache to localStorage for "our data"
============================================================ */
(function () {
  "use strict";

  const VER = "1.7.4";
  if (window.__AIML_DETAILS_PANEL_VER__ === VER) return;
  window.__AIML_DETAILS_PANEL_VER__ = VER;

  const cfg = () => window.AIML_LIVE_CFG || {};
  const base = () => String(cfg().fixturesBase || cfg().liveUltraBase || "").replace(/\/+$/, "");

  const esc = (s) =>
    String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  function toYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function cacheKeyStandings(slug) {
    const day = toYMD(new Date());
    return `AIML_STANDINGS_CACHE:${slug}:${day}`;
  }

  function readStandingsCache(slug) {
    try {
      const raw = localStorage.getItem(cacheKeyStandings(slug));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  function writeStandingsCache(slug, payload) {
    try {
      localStorage.setItem(cacheKeyStandings(slug), JSON.stringify(payload));
    } catch (_) {}
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 9000);
    try {
      const res = await fetch(url, { method: "GET", credentials: "omit", signal: ctrl.signal });
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(t);
    }
  }

  function pickTeamName(t) {
    if (!t) return "";
    return (
      t.displayName ||
      t.name ||
      t.longName ||
      t.shortName ||
      t.abbreviation ||
      t.teamName ||
      ""
    );
  }

  function renderStandingsTable(table) {
    if (!Array.isArray(table) || !table.length) {
      return `<div class="muted">Standings unavailable.</div>`;
    }
    const rows = table
      .map((r) => {
        const rank = esc(r.rank ?? r.position ?? "");
        const team = esc(r.teamName ?? pickTeamName(r.team) ?? r.name ?? r.abbr ?? "");
        const pts = esc(r.points ?? r.pts ?? "");
        const gp = esc(r.played ?? r.gp ?? "");
        const gd = esc(r.gd ?? r.goalDiff ?? "");
        return `<tr>
          <td style="padding:6px 8px;opacity:.9;">${rank}</td>
          <td style="padding:6px 8px;font-weight:700;">${team}</td>
          <td style="padding:6px 8px;opacity:.9;text-align:right;">${gp}</td>
          <td style="padding:6px 8px;opacity:.9;text-align:right;">${gd}</td>
          <td style="padding:6px 8px;font-weight:800;text-align:right;">${pts}</td>
        </tr>`;
      })
      .join("");

    return `
      <div style="overflow:auto;border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:rgba(255,255,255,0.04);">
              <th style="text-align:left;padding:8px;">#</th>
              <th style="text-align:left;padding:8px;">Team</th>
              <th style="text-align:right;padding:8px;">GP</th>
              <th style="text-align:right;padding:8px;">GD</th>
              <th style="text-align:right;padding:8px;">Pts</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderStatsBlock(stats) {
    const arr = Array.isArray(stats) ? stats : [];
    if (!arr.length) return `<div class="muted">No stats.</div>`;

    const items = arr
      .slice(0, 24)
      .map((it) => {
        const k = esc(it.name || it.label || "");
        const hv = esc(it.home ?? it.h ?? it.valueHome ?? "");
        const av = esc(it.away ?? it.a ?? it.valueAway ?? "");
        return `
          <div style="display:grid;grid-template-columns:1fr auto auto;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="opacity:.9;">${k}</div>
            <div style="text-align:right;font-weight:800;">${hv}</div>
            <div style="text-align:right;font-weight:800;opacity:.95;">${av}</div>
          </div>`;
      })
      .join("");

    return `<div>${items}</div>`;
  }

  function normalizeSummary(summary, match) {
    // Be defensive: accept many shapes from worker
    const s = summary || {};
    const home = match?.home || s.home || s.homeTeam || pickTeamName(s.teams?.home) || "";
    const away = match?.away || s.away || s.awayTeam || pickTeamName(s.teams?.away) || "";
    const score = s.score_text || s.score || match?.score || "";
    const status = s.status || match?.status || "";
    const venue = s.venue || s.stadium || "";
    const kickoff = s.kickoff || match?.kickoff || match?.utcDate || "";
    const stats = s.stats || s.statistics || [];
    return { home, away, score, status, venue, kickoff, stats, raw: s };
  }

  function section(title, bodyHtml) {
    return `
      <div style="margin-top:14px;">
        <div style="font-weight:900;margin-bottom:8px;">${esc(title)}</div>
        ${bodyHtml}
      </div>`;
  }

  // =====================================================
  // HYBRID V1 (AIML Match Details)
  // - Deterministic, no AI required yet
  // - Adds: Match DNA, Win Paths, Risk Meter
  // =====================================================
  function findTeamInTable(table, teamName) {
    if (!Array.isArray(table) || !teamName) return null;
    const tn = String(teamName).toLowerCase().trim();
    return (
      table.find(r => String(r.teamName || pickTeamName(r.team) || r.name || r.abbr || "").toLowerCase().trim() === tn) ||
      table.find(r => String(r.teamName || pickTeamName(r.team) || r.name || r.abbr || "").toLowerCase().includes(tn)) ||
      null
    );
  }

  function normalizeFormSeq(arr) {
    const seq = Array.isArray(arr) ? arr : [];
    return seq
      .map(x => String(x).toUpperCase().trim())
      .filter(x => x === "W" || x === "D" || x === "L")
      .slice(0, 5);
  }

  function computeDNA(homeRow, awayRow) {
    // Very safe v1 heuristics based mostly on table position gap
    const hp = Number(homeRow?.rank ?? homeRow?.position ?? NaN);
    const ap = Number(awayRow?.rank ?? awayRow?.position ?? NaN);

    let control = "neutral";
    if (Number.isFinite(hp) && Number.isFinite(ap)) {
      const gap = hp - ap; // positive => away higher
      if (gap >= 6) control = "away";
      else if (gap <= -6) control = "home";
    }

    let volatility = "medium";
    if (Number.isFinite(hp) && Number.isFinite(ap)) {
      const diff = Math.abs(hp - ap);
      volatility = diff >= 10 ? "medium" : "high";
    }

    const tempo = "medium"; // keep conservative until we have stats/form
    return { tempo, control, volatility };
  }

  function computeRisk(homeRow, awayRow) {
    const hp = Number(homeRow?.rank ?? homeRow?.position ?? NaN);
    const ap = Number(awayRow?.rank ?? awayRow?.position ?? NaN);

    // Base risks
    let upset = 45;
    let draw = 40;

    if (Number.isFinite(hp) && Number.isFinite(ap)) {
      const diff = Math.abs(hp - ap);
      // Big difference: upset lower, draw lower
      if (diff >= 12) { upset = 25; draw = 30; }
      else if (diff >= 8) { upset = 32; draw = 34; }
      else if (diff >= 4) { upset = 42; draw = 40; }
      else { upset = 55; draw = 52; }
    }

    // clamp
    upset = Math.max(0, Math.min(100, upset));
    draw = Math.max(0, Math.min(100, draw));
    return { upsetRisk: upset, drawRisk: draw };
  }

  function labelControl(v) {
    if (v === "home") return "HOME CONTROL";
    if (v === "away") return "AWAY CONTROL";
    return "NEUTRAL";
  }

  function renderChip(label, value) {
    return `<span class="aiml-chip"><span class="aiml-chip-label">${esc(label)}</span><span class="aiml-chip-value">${esc(value)}</span></span>`;
  }

  function renderBar(label, value) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return `
      <div class="aiml-risk-row">
        <div class="aiml-risk-label">${esc(label)}</div>
        <div class="aiml-risk-bar"><div class="aiml-risk-fill" style="width:${v}%;"></div></div>
        <div class="aiml-risk-val">${esc(v)}</div>
      </div>`;
  }

  function renderHybridBlock(summary, standingsTable) {
    const homeRow = findTeamInTable(standingsTable, summary.home);
    const awayRow = findTeamInTable(standingsTable, summary.away);

    const dna = computeDNA(homeRow, awayRow);
    const risks = computeRisk(homeRow, awayRow);

    const winPaths = {
      home: [
        "Fast start + early lead",
        "Set-pieces impact",
        "Opponent underperforms finishing"
      ],
      draw: [
        "0-0 / 1-1 game script",
        "Low conversion rate on chances"
      ],
      away: [
        "Sustained control in midfield",
        "Higher shot volume + better finishing",
        "Breakthrough before 60'"
      ]
    };

    const insights = [
      "Primary edge likely comes from overall team quality + game control.",
      "If the match stays level deep into the first half, draw risk rises.",
      "Key swing factors: first goal timing and set-pieces."
    ];

    return `
      <div class="aiml-hybrid">
        <div class="aiml-hybrid-head">AIML Hybrid Match Intel</div>

        <div class="aiml-dna">
          ${renderChip("TEMPO", dna.tempo.toUpperCase())}
          ${renderChip("CONTROL", labelControl(dna.control))}
          ${renderChip("VOLATILITY", dna.volatility.toUpperCase())}
        </div>

        <div class="aiml-winpaths">
          <div class="aiml-wincol">
            <div class="aiml-win-title">HOME WIN PATH</div>
            <ul class="aiml-win-list">${winPaths.home.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          </div>
          <div class="aiml-wincol">
            <div class="aiml-win-title">DRAW PATH</div>
            <ul class="aiml-win-list">${winPaths.draw.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          </div>
          <div class="aiml-wincol">
            <div class="aiml-win-title">AWAY WIN PATH</div>
            <ul class="aiml-win-list">${winPaths.away.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
          </div>
        </div>

        <div class="aiml-risk">
          <div class="aiml-subtitle">Risk Meter (0–100)</div>
          ${renderBar("Upset Risk", risks.upsetRisk)}
          ${renderBar("Draw Risk", risks.drawRisk)}
        </div>

        <div class="aiml-insights">
          <div class="aiml-subtitle">Key Insights</div>
          <ul class="aiml-insights-list">${insights.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>
    `;
  }


  

  // =====================================================
  // LOCAL-ONLY DETAILS (NO WORKER, NO FETCH)
  // Used by ⓘ to avoid any network dependency.
  // =====================================================
  function fmtKickoffLocal(m) {
    const iso = m?.kickoff || m?.utcDate || null;
    const ms = m?.kickoff_ms != null ? Number(m.kickoff_ms) : null;
    let d = null;
    if (ms && Number.isFinite(ms)) d = new Date(ms);
    else if (iso) {
      const t = Date.parse(iso);
      if (!Number.isNaN(t)) d = new Date(t);
    }
    if (!d) return "";
    try {
      return d.toLocaleString("el-GR", {
        timeZone: "Europe/Athens",
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (_) {
      return d.toLocaleString();
    }
  }

  function normalizeScore(m) {
    const sh = (m?.scoreHome != null) ? Number(m.scoreHome) : null;
    const sa = (m?.scoreAway != null) ? Number(m.scoreAway) : null;
    if (Number.isFinite(sh) && Number.isFinite(sa)) return `${sh}-${sa}`;
    return "";
  }

  function normalizeStatus(m) {
    return String(m?.status || "").replace("STATUS_", "") || "";
  }

  function renderLocal(match, mountEl) {
    const el = mountEl;
    if (!el) return;

    const m = match || {};
    const home = esc(m.home || "");
    const away = esc(m.away || "");
    const league = esc(m.leagueName || m.leagueSlug || "");
    const status = esc(normalizeStatus(m));
    const score = esc(normalizeScore(m));
    const minute = (m.minute != null && Number(m.minute) > 0) ? ` • ${esc(String(m.minute))}'` : "";
    const kickoffLocal = esc(fmtKickoffLocal(m));

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:18px;">${home} <span style="opacity:.6;">vs</span> ${away}</div>
        <div style="opacity:.85;font-weight:800;">${status}${minute}</div>
      </div>

      <div style="margin-top:6px;opacity:.85;">
        ${score ? `<span style="font-weight:900;">${score}</span>` : ``}
        ${kickoffLocal ? `<span style="margin-left:10px;">${kickoffLocal}</span>` : ``}
      </div>

      <div style="margin-top:6px;opacity:.75;font-size:12px;">
        League: <b>${league}</b>
        ${m.matchId || m.id ? `<span style="margin-left:10px;opacity:.7;">ID: ${esc(String(m.matchId || m.id))}</span>` : ``}
      </div>

      ${renderHybridBlock(
        normalizeSummary({}, m),
        []
      )}
    `;
  }


  async function loadAndRender(match, mountEl, opts) {
    const el = mountEl;
    if (!el) return;

    const m = match || {};
    const league = String(m.leagueSlug || m.league || m.league_code || "").trim();
    const eventId = String(m.id || m.eventId || m.event || "").trim();

    if (!base()) {
      el.innerHTML = `<div class="muted">Missing fixturesBase/liveUltraBase.</div>`;
      return;
    }
    if (!league || !eventId) {
      el.innerHTML = `<div class="muted">Missing leagueSlug or event id.</div>`;
      return;
    }

    const summaryUrl = `${base()}/match-summary?league=${encodeURIComponent(league)}&event=${encodeURIComponent(eventId)}&v=${Date.now()}`;
    const standingsUrl = `${base()}/standings?league=${encodeURIComponent(league)}&v=${Date.now()}`;

    // Summary
    const sRes = await fetchJson(summaryUrl, 10000);
    const sOk = !!(sRes.ok && sRes.json && (sRes.json.ok !== false));
    const summary = normalizeSummary(sRes.json, m);

    // Standings (with cache fallback)
    let standingsPayload = null;
    let fromCache = false;

    const cached = readStandingsCache(league);
    if (cached && !opts?.forceReload) {
      standingsPayload = cached;
      fromCache = true;
    }

    if (!standingsPayload || opts?.forceReload) {
      const tRes = await fetchJson(standingsUrl, 10000);
      if (tRes.ok && tRes.json && (tRes.json.ok !== false)) {
        standingsPayload = tRes.json;
        fromCache = false;
        writeStandingsCache(league, tRes.json);
      } else if (!standingsPayload && cached) {
        standingsPayload = cached;
        fromCache = true;
      }
    }

    const standingsTable =
      standingsPayload?.table ||
      standingsPayload?.standings ||
      standingsPayload?.items ||
      standingsPayload?.data ||
      null;

    const header = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="font-weight:900;font-size:18px;">${esc(summary.home)} <span style="opacity:.6;">vs</span> ${esc(summary.away)}</div>
        <div style="opacity:.85;font-weight:800;">${esc(summary.status || "")}</div>
      </div>
      <div style="margin-top:6px;opacity:.85;">
        ${summary.score ? `<span style="font-weight:900;">${esc(summary.score)}</span>` : ``}
        ${summary.venue ? `<span style="margin-left:10px;">${esc(summary.venue)}</span>` : ``}
      </div>
      <div style="margin-top:6px;opacity:.75;font-size:12px;">
        League: <b>${esc(m.leagueName || league)}</b>
        ${fromCache ? `<span style="margin-left:10px;opacity:.75;">(standings from cache)</span>` : ``}
      </div>
    `;

    const summaryBlock = sOk
      ? section("Key Stats", renderStatsBlock(summary.stats))
      : `<div class="muted">Summary unavailable.</div>`;

    const standingsBlock = section("Standings", renderStandingsTable(standingsTable));

    // Hybrid V1 block (only in Matches panel)
    const hybridBlock = renderHybridBlock(summary, standingsTable);

    // Small diagnostics if things are missing (collapsed)
    const diag = (!sOk || !Array.isArray(standingsTable)) ? `
      <details style="margin-top:12px;opacity:.85;">
        <summary style="cursor:pointer;">Diagnostics</summary>
        <div style="font-size:12px;margin-top:8px;">
          <div>summaryUrl: ${esc(summaryUrl)}</div>
          <div>standingsUrl: ${esc(standingsUrl)}</div>
          <div>summaryOK: ${esc(String(sOk))} (status ${esc(String(sRes.status))})</div>
        </div>
      </details>` : ``;

    el.innerHTML = `
      ${header}
      ${summaryBlock}
      ${standingsBlock}
      ${hybridBlock}
      ${diag}
    `;
  }

  window.DetailsPanel = {
    __ver: VER,
    loadAndRender,
    renderLocal
  };
})();
