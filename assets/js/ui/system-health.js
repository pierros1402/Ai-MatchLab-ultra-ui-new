(function () {
  "use strict";

  const POLL_INTERVAL_MS = 5 * 60 * 1000; // refresh every 5 min while open

  // ── Helpers ──────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function engineUrl(path) {
    const base =
      (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL) ||
      window.__AIML_ENGINE_BASE ||
      "https://ai-matchlab-engine.onrender.com";
    return String(base).replace(/\/+$/, "") + path;
  }

  function statusColor(report) {
    if (!report) return "#6b7280";               // fetch failed — gray
    if (report.status === "no_report") return "#f59e0b"; // no report = UNKNOWN, treat as warning
    if (report.blocked && report.blocked.length > 0) return "#ef4444";
    if (report.autoFixed && report.autoFixed.length > 0) return "#f59e0b";
    if (report.warnings && report.warnings.length > 0) return "#f59e0b";
    return "#22c55e";
  }

  function formatTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }) + " (Athens)";
  }

  function issueRow(icon, color, label, detail) {
    return `<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="color:${color};font-size:14px;min-width:18px;">${icon}</span>
      <div>
        <div style="font-size:13px;color:#e2e8f0;">${label}</div>
        ${detail ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${detail}</div>` : ""}
      </div>
    </div>`;
  }

  function renderReport(report) {
    if (!report) return `<p style="color:#94a3b8;font-size:13px;">Could not load report.</p>`;
    if (report.status === "no_report") {
      return `<div style="padding:10px 0;">
        <div style="font-size:14px;color:#fbbf24;font-weight:600;">⚠ UNKNOWN — No invariant report</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px;">The daily pipeline has not run yet or did not produce a report.<br>Snapshot integrity is <b>unverified</b> — do not treat as clean.</div>
      </div>`;
    }

    const rows = [];

    // Blocked
    for (const b of (report.blocked || [])) {
      let detail = "";
      if (b.type === "status_mismatch_unpatchable") detail = `${b.match} — fixture: <b>${b.fixtureStatus}</b> | details: <b>${b.detailStatus}</b>`;
      else if (b.type === "manifest_value_count_mismatch") detail = `manifest.valuePicks=${b.manifestValuePicks} ≠ value.json.count=${b.valueJsonCount}`;
      else if (b.type === "value_count_array_mismatch") detail = `declared count=${b.declaredCount} but picks.length=${b.actualCount}`;
      else detail = JSON.stringify(b);
      rows.push(issueRow("✗", "#ef4444", b.type.replace(/_/g, " "), detail));
    }

    // Auto-fixed
    for (const a of (report.autoFixed || [])) {
      let detail = "";
      if (a.type === "status_mismatch") detail = `${a.match} — ${a.before} → ${a.after} ✓`;
      else detail = JSON.stringify(a);
      rows.push(issueRow("⚡", "#f59e0b", "auto-fixed: " + a.type.replace(/_/g, " "), detail));
    }

    // Warnings
    for (const w of (report.warnings || [])) {
      let detail = "";
      if (w.type === "coverage_floor_drop") detail = `floor ${w.staticFloor}→${w.effectiveFloor} (actual fixtures: ${w.actualFixtures})`;
      else if (w.type === "minute_double_apostrophe") detail = `match ${w.matchId}: minute="${w.minute}"`;
      else detail = JSON.stringify(w);
      rows.push(issueRow("⚠", "#f59e0b", w.type.replace(/_/g, " "), detail));
    }

    if (rows.length === 0) {
      rows.push(issueRow("✓", "#22c55e", "All checks passed", "No issues found"));
    }

    const valueLine = report.valueSafe === false
      ? `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(239,68,68,.12);color:#fca5a5;font-size:12px;">⚠ Value pipeline marked <b>UNSAFE</b> — picks not generated for affected matches</div>`
      : `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(34,197,94,.1);color:#86efac;font-size:12px;">✓ Value pipeline <b>SAFE</b></div>`;

    return `<div>${rows.join("")}</div>${valueLine}
      <div style="margin-top:12px;font-size:11px;color:#64748b;">Last check: ${formatTime(report.checkedAt)} · Day: ${report.dayKey || "—"}</div>`;
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  function buildModal() {
    const existing = el("system-health-modal");
    if (existing) return existing;

    const modal = document.createElement("div");
    modal.id = "system-health-modal";
    modal.style.cssText = `
      display:none;position:fixed;inset:0;z-index:9999;
      align-items:flex-start;justify-content:flex-end;
      padding:56px 12px 0;pointer-events:none;
    `;

    modal.innerHTML = `
      <div id="system-health-panel" style="
        pointer-events:all;
        background:#0f172a;
        border:1px solid rgba(255,255,255,.1);
        border-radius:10px;
        width:360px;max-width:calc(100vw - 24px);
        max-height:70vh;overflow-y:auto;
        box-shadow:0 8px 32px rgba(0,0,0,.6);
        padding:16px;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <span style="font-size:14px;font-weight:600;color:#e2e8f0;">🛡 System Health</span>
          <button id="system-health-close" style="
            background:none;border:none;cursor:pointer;
            color:#64748b;font-size:18px;line-height:1;padding:2px 6px;
          ">×</button>
        </div>
        <div id="system-health-body" style="min-height:60px;">
          <p style="color:#94a3b8;font-size:13px;">Loading…</p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    el("system-health-close").addEventListener("click", closeModal);
    modal.addEventListener("pointerdown", (e) => {
      if (e.target === modal) closeModal();
    });

    return modal;
  }

  function openModal() {
    const modal = buildModal();
    modal.style.display = "flex";
    fetchAndRender();
  }

  function closeModal() {
    const modal = el("system-health-modal");
    if (modal) modal.style.display = "none";
  }

  // ── Fetch & badge update ──────────────────────────────────────────────────

  let _lastReport = null;

  async function fetchReport() {
    try {
      const res = await fetch(engineUrl("/system-health"));
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function updateBadge(report) {
    const badge = el("system-health-badge");
    if (!badge) return;
    const color = statusColor(report);
    if (color === "#22c55e") {
      badge.style.display = "none"; // all clear — hide badge
    } else {
      badge.style.display = "block";
      badge.style.background = color;
    }
  }

  async function fetchAndRender() {
    const body = el("system-health-body");
    if (body) body.innerHTML = `<p style="color:#94a3b8;font-size:13px;">Loading…</p>`;

    const report = await fetchReport();
    _lastReport = report;
    updateBadge(report);
    if (body) body.innerHTML = renderReport(report);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function boot() {
    const btn = el("btn-system-health");
    if (!btn) return;

    // Show button (admin mode is always active)
    btn.style.display = "";

    btn.addEventListener("click", () => {
      const modal = el("system-health-modal");
      const isOpen = modal && modal.style.display === "flex";
      if (isOpen) closeModal();
      else openModal();
    });

    // Initial badge fetch — non-blocking
    fetchReport().then(r => { _lastReport = r; updateBadge(r); });

    // Poll badge in background
    setInterval(() => {
      fetchReport().then(r => { _lastReport = r; updateBadge(r); });
    }, POLL_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
