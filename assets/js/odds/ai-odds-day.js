/**
 * ai-odds-day.js
 *
 * Autonomous odds day view. Fetches /odds/day (real bookmaker 1X2 odds with frozen
 * opening + drift, plus our AI assessment) and renders a compact table. Self
 * contained so it works regardless of the per-match selection flow / fixture ids.
 */
(function () {
  "use strict";

  function base() {
    return (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL) ||
           (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase) || "";
  }

  function fmt(n) { return (n == null || isNaN(n)) ? "–" : Number(n).toFixed(2); }

  function driftCell(open, current, delta) {
    const d = Number(delta) || 0;
    const arrow = d > 0.01 ? "▲" : d < -0.01 ? "▼" : "•";
    const color = d > 0.01 ? "#e15554" : d < -0.01 ? "#3bb273" : "#888";
    const sign = d > 0 ? "+" : "";
    return `<span title="open ${fmt(open)}">${fmt(current)}</span> ` +
           `<small style="color:${color}">${arrow}${d ? sign + d.toFixed(2) : ""}</small>`;
  }

  function row(m) {
    const mk = m.market || {};
    const ai = (m.aiAssessment && m.aiAssessment.odds) || {};
    const comp = m.competition || m.leagueSlug || "";
    return `<tr>
      <td style="text-align:left">
        <strong>${m.home || "?"}</strong> v <strong>${m.away || "?"}</strong>
        <div style="opacity:.6;font-size:11px">${comp}${m.kickoffLocal ? " · " + m.kickoffLocal.slice(11) : ""}</div>
      </td>
      <td>${mk.open ? driftCell(mk.open.home, mk.current.home, mk.delta.home) : "–"}</td>
      <td>${mk.open ? driftCell(mk.open.draw, mk.current.draw, mk.delta.draw) : "–"}</td>
      <td>${mk.open ? driftCell(mk.open.away, mk.current.away, mk.delta.away) : "–"}</td>
      <td style="opacity:.75">${ai.home ? `${fmt(ai.home)} / ${fmt(ai.draw)} / ${fmt(ai.away)}` : "–"}</td>
    </tr>`;
  }

  function render(el, data) {
    const matches = (data && data.matches) || [];
    if (!matches.length) {
      el.innerHTML = `<div style="padding:12px;opacity:.6">No odds captured for ${data && data.dayKey || "today"} yet.</div>`;
      return;
    }
    el.innerHTML = `
      <div style="padding:8px 4px;font-weight:600">Market odds (opening → now) · our AI assessment — ${data.dayKey} (${matches.length})</div>
      <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="opacity:.7;border-bottom:1px solid rgba(128,128,128,.3)">
          <th style="text-align:left">Match</th><th>1</th><th>X</th><th>2</th><th>AI 1/X/2</th>
        </tr></thead>
        <tbody>${matches.map(row).join("")}</tbody>
      </table></div>`;
  }

  async function load() {
    const el = document.getElementById("ai-odds-day");
    if (!el) return;
    try {
      const res = await fetch(`${base()}/odds/day`, { cache: "no-store" });
      if (!res.ok) { el.innerHTML = ""; return; }
      render(el, await res.json());
    } catch (err) {
      console.warn("[ai-odds-day]", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
  // Refresh periodically so drift shows without a reload.
  setInterval(load, 5 * 60 * 1000);
})();
