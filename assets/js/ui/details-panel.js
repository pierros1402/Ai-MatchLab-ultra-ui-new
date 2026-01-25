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
      ${diag}
    `;
  }

  window.DetailsPanel = {
    __ver: VER,
    loadAndRender
  };
})();
// =====================================================
// DETAILS OPEN HOOK (GLOBAL)
// =====================================================
if (window.on) {
  window.on("details-open", (match) => {
    const modal = document.getElementById("match-details-modal");
    const body = document.getElementById("panel-details");
    if (!modal || !body || !match) return;

    modal.classList.remove("hidden");

    if (window.DetailsPanel?.loadAndRender) {
      window.DetailsPanel.loadAndRender(match, body, { forceReload: false });
    } else {
      body.innerHTML = "<div class='muted'>Details loader unavailable.</div>";
    }
  });
}
