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

  function esc(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function statusColor(report) {
    if (!report) return "#6b7280";
    if (report.status === "no_report") return "#f59e0b";

    const severity = String(report.severity || report.status || "").toLowerCase();
    if (severity === "error") return "#ef4444";
    if (severity === "warning") return "#f59e0b";
    if (severity === "info") return "#38bdf8";

    if (report.issueCounts?.error > 0) return "#ef4444";
    if (report.issueCounts?.warning > 0) return "#f59e0b";
    if (report.issueCounts?.info > 0) return "#38bdf8";

    if (report.blocked && report.blocked.length > 0) return "#ef4444";
    if (report.autoFixed && report.autoFixed.length > 0) return "#f59e0b";
    if (report.warnings && report.warnings.length > 0) return "#f59e0b";

    return "#22c55e";
  }

  function formatTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return esc(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }) + " (Athens)";
  }

  function issueTone(severity) {
    const s = String(severity || "").toLowerCase();
    if (s === "error") return { icon: "✗", color: "#ef4444", label: "ERROR" };
    if (s === "warning") return { icon: "⚠", color: "#f59e0b", label: "WARNING" };
    if (s === "info") return { icon: "i", color: "#38bdf8", label: "INFO" };
    return { icon: "✓", color: "#22c55e", label: "OK" };
  }

  function compactJson(v) {
    try {
      return esc(JSON.stringify(v, null, 2));
    } catch (_) {
      return esc(String(v));
    }
  }

  function issueDetails(issue) {
    const d = issue?.details || {};
    const type = String(issue?.type || "");

    if (type === "coverage_floor_drop") {
      return `source: ${esc(issue.source)} · static floor: <b>${esc(d.staticFloor)}</b> · effective floor: <b>${esc(d.effectiveFloor)}</b> · actual fixtures: <b>${esc(d.actualFixtures)}</b> · drop: <b>${esc(d.drop)}</b>`;
    }

    if (type === "acquisition_skipped_slugs") {
      return `source: ${esc(issue.source)} · slugs: <b>${esc((d.slugs || []).join(", "))}</b>`;
    }

    if (type === "build_not_strict_clean") {
      return `source: ${esc(issue.source)} · clean: <b>${esc(d.clean)}</b> · cleanStrict: <b>${esc(d.cleanStrict)}</b>`;
    }

    if (type === "plan_b_unresolved_settlement") {
      return `source: ${esc(issue.source)} · picks: <b>${esc(d.picks)}</b> · settled: <b>${esc(d.settled)}</b> · unresolved: <b>${esc(d.unresolved)}</b>`;
    }

    if (type === "skipped_freshness_input") {
      return `source: ${esc(issue.source)} · artifact: <b>${esc(d.artifact)}</b> · reason: <b>${esc(d.skipped || d.staleReason)}</b>`;
    }

    if (type === "production_value_zero_candidates") {
      return `source: ${esc(issue.source)} · fixturesSeen: <b>${esc(d.fixturesSeen)}</b> · eligible: <b>${esc(d.eligibleEvaluated)}</b> · candidateMarkets: <b>${esc(d.candidateMarkets)}</b> · approved: <b>${esc(d.approved)}</b>`;
    }

    if (type === "value_plan_comparison_summary") {
      const a = d.planA || {};
      const b = d.planB || {};
      return `source: ${esc(issue.source)} · Plan A picks: <b>${esc(a.count)}</b> · Plan B picks: <b>${esc(b.count)}</b>`;
    }

    if (type === "artifact_missing" || type === "artifact_json_invalid") {
      return `source: ${esc(issue.source)} · artifact: <b>${esc(d.artifact)}</b>${d.error ? " · error: " + esc(d.error) : ""}`;
    }

    const keys = Object.keys(d);
    if (!keys.length) return `source: ${esc(issue.source || "—")}`;

    return `source: ${esc(issue.source || "—")}<pre style="white-space:pre-wrap;margin:6px 0 0;color:#94a3b8;font-size:10px;line-height:1.35;">${compactJson(d)}</pre>`;
  }

  function issueRowFromIssue(issue) {
    const tone = issueTone(issue?.severity);
    const type = String(issue?.type || "unknown_issue").replace(/_/g, " ");
    const source = issue?.source ? `<span style="color:#64748b;">[${esc(issue.source)}]</span> ` : "";
    const message = issue?.message ? `<div style="font-size:11px;color:#cbd5e1;margin-top:2px;">${esc(issue.message)}</div>` : "";
    const detail = issueDetails(issue);

    return `<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="color:${tone.color};font-size:14px;min-width:18px;">${tone.icon}</span>
      <div style="min-width:0;">
        <div style="font-size:12px;color:${tone.color};font-weight:700;">${esc(tone.label)} · ${source}${esc(type)}</div>
        ${message}
        <div style="font-size:11px;color:#94a3b8;margin-top:3px;">${detail}</div>
      </div>
    </div>`;
  }

  function issueRow(icon, color, label, detail) {
    return `<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="color:${color};font-size:14px;min-width:18px;">${icon}</span>
      <div>
        <div style="font-size:13px;color:#e2e8f0;">${esc(label)}</div>
        ${detail ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;">${detail}</div>` : ""}
      </div>
    </div>`;
  }

  function renderArtifacts(report) {
    const artifacts = report?.artifacts || {};
    const keys = Object.keys(artifacts);
    if (!keys.length) return "";

    const rows = keys.map(k => {
      const a = artifacts[k] || {};
      const ok = a.exists && a.ok;
      const color = ok ? "#22c55e" : "#ef4444";
      const mark = ok ? "✓" : "✗";
      const stamp = a.generatedAt || a.checkedAt || a.updatedAt || "";
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#94a3b8;padding:2px 0;">
        <span><span style="color:${color};font-weight:700;">${mark}</span> ${esc(k)}</span>
        <span style="text-align:right;">${esc(a.path || "")}${stamp ? " · " + esc(stamp) : ""}</span>
      </div>`;
    }).join("");

    return `<details style="margin-top:10px;">
      <summary style="cursor:pointer;color:#cbd5e1;font-size:11px;">Artifacts checked</summary>
      <div style="margin-top:6px;">${rows}</div>
    </details>`;
  }

  function renderValueSummary(report) {
    const value = report?.summaries?.value;
    if (!value) return "";

    const prod = value.production || {};
    const audit = value.audit || {};
    const comparison = value.comparison || {};
    const planA = comparison.plans?.A;
    const planB = comparison.plans?.B;

    return `<div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(15,23,42,.75);border:1px solid rgba(255,255,255,.06);font-size:11px;color:#cbd5e1;">
      <div style="font-weight:700;color:#e2e8f0;margin-bottom:4px;">Value diagnostics</div>
      <div>Production: <b>${esc(prod.source || "—")}</b> · picks: <b>${esc(prod.count ?? "—")}</b> · ok: <b>${esc(prod.ok ?? "—")}</b></div>
      <div>Contract: canonicalOnly=<b>${esc(audit.sourceContract?.canonicalOnly ?? "—")}</b> · deploySnapshotInput=<b>${esc(audit.sourceContract?.deploySnapshotInput ?? "—")}</b></div>
      <div>Universe: fixtures=<b>${esc(audit.universe?.fixturesSeen ?? "—")}</b> · candidates=<b>${esc(audit.universe?.candidateMarkets ?? "—")}</b> · approved=<b>${esc(audit.universe?.approved ?? "—")}</b></div>
      <div>Plan A/B: A=<b>${esc(planA?.count ?? "—")}</b> · B=<b>${esc(planB?.count ?? "—")}</b></div>
    </div>`;
  }

  function renderReport(report) {
    if (!report) return `<p style="color:#94a3b8;font-size:13px;">Could not load report.</p>`;

    if (report.status === "no_report") {
      return `<div style="padding:10px 0;">
        <div style="font-size:14px;color:#fbbf24;font-weight:600;">⚠ UNKNOWN — No diagnostic report</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px;">The daily pipeline has not produced system-health diagnostics for this day.<br>Snapshot integrity is <b>unverified</b> — do not treat as clean.</div>
      </div>`;
    }

    const issues = Array.isArray(report.issues) ? report.issues : [];
    const rows = [];

    if (issues.length) {
      const order = { error: 0, warning: 1, info: 2 };
      issues
        .slice()
        .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
        .forEach(issue => rows.push(issueRowFromIssue(issue)));
    } else {
      for (const b of (report.blocked || [])) {
        let detail = "";
        if (b.type === "status_mismatch_unpatchable") detail = `${esc(b.match)} — fixture:<b>${esc(b.fixtureStatus)}</b> | details:<b>${esc(b.detailStatus)}</b>`;
        else if (b.type === "manifest_value_count_mismatch") detail = `manifest.valuePicks=${esc(b.manifestValuePicks)} ≠ value.json.count=${esc(b.valueJsonCount)}`;
        else if (b.type === "value_count_array_mismatch") detail = `declared count=${esc(b.declaredCount)} but picks.length=${esc(b.actualCount)}`;
        else detail = compactJson(b);
        rows.push(issueRow("✗", "#ef4444", String(b.type || "blocked").replace(/_/g, " "), detail));
      }

      for (const a of (report.autoFixed || [])) {
        let detail = "";
        if (a.type === "status_mismatch") detail = `${esc(a.match)} — ${esc(a.before)} → ${esc(a.after)} ✓`;
        else detail = compactJson(a);
        rows.push(issueRow("⚡", "#f59e0b", "auto-fixed: " + String(a.type || "issue").replace(/_/g, " "), detail));
      }

      for (const w of (report.warnings || [])) {
        let detail = "";
        if (w.type === "coverage_floor_drop") detail = `floor ${esc(w.staticFloor)}→${esc(w.effectiveFloor)} (actual fixtures: ${esc(w.actualFixtures)})`;
        else if (w.type === "minute_double_apostrophe") detail = `match ${esc(w.matchId)}: minute="${esc(w.minute)}"`;
        else detail = compactJson(w);
        rows.push(issueRow("⚠", "#f59e0b", String(w.type || "warning").replace(/_/g, " "), detail));
      }
    }

    if (rows.length === 0) {
      rows.push(issueRow("✓", "#22c55e", "All checks passed", "No issues found"));
    }

    const counts = report.issueCounts || {};
    const headerColor = statusColor(report);
    const severity = String(report.severity || report.status || "ok").toUpperCase();

    const header = `<div style="margin-bottom:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.04);border-left:3px solid ${headerColor};">
      <div style="font-size:13px;color:#e2e8f0;font-weight:700;">System Health: ${esc(severity)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Errors: <b>${esc(counts.error || 0)}</b> · Warnings: <b>${esc(counts.warning || 0)}</b> · Info: <b>${esc(counts.info || 0)}</b></div>
    </div>`;

    return `${header}<div>${rows.join("")}</div>${renderValueSummary(report)}${renderArtifacts(report)}
      <div style="margin-top:12px;font-size:11px;color:#64748b;">Last check: ${formatTime(report.checkedAt)} · Day: ${esc(report.dayKey || "—")} · Manifest: ${esc(report.manifestGeneratedAt || "—")}</div>`;
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

  function resolveSystemHealthDay() {
    const queryDate = (() => {
      try {
        return new URLSearchParams(window.location.search || "").get("date") || "";
      } catch {
        return "";
      }
    })();

    const candidates = [
      window.__AIML_SELECTED_DATE,
      window.__AIML_SELECTED_DAY,
      window.__AIML_SELECTED_DATE_KEY,
      window.__AIML_CURRENT_DATE,
      queryDate,
      document.querySelector("[data-selected-date]")?.getAttribute("data-selected-date"),
      document.querySelector("[data-day]")?.getAttribute("data-day"),
      document.querySelector("input[type='date']")?.value
    ];

    for (const value of candidates) {
      const text = String(value || "").trim();
      const match = text.match(/^\d{4}-\d{2}-\d{2}$/);
      if (match) return text;
    }

    return "";
  }

  // Fetch & badge update

  let _lastReport = null;

  async function fetchReport() {
    try {
      const day = resolveSystemHealthDay();
      const path = day ? `/system-health?day=${encodeURIComponent(day)}` : "/system-health";
      const res = await fetch(engineUrl(path));
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
