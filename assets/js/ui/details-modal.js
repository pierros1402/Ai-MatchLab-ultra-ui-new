/* ============================================================
   assets/js/ui/details-modal.js (FULL LINKED v1.7.2)
   - Opens on: details-open / details:open / match-details
   - Compatible with ids: #details-modal or #match-details-modal
   - Uses DetailsPanel (worker-backed) to render:
       Summary + Stats + Standings
   - Exposes window.DetailsModal { open, close, isOpen, __ver }
============================================================ */
(function () {
  "use strict";

  const VER = "1.7.2";
  if (window.__AIML_DETAILS_MODAL_VER__ === VER) return;
  window.__AIML_DETAILS_MODAL_VER__ = VER;

  const on = (n, f) => (window.on ? window.on(n, f) : null);
  const esc = (s) =>
    String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  let modal = null;
  let content = null;

  function ensureModal() {
    modal = document.getElementById("details-modal") || document.getElementById("match-details-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "details-modal";
      modal.className = "hidden";
      document.body.appendChild(modal);
    }

    // Force overlay base styles (theme-aware via CSS vars if present)
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "2147483647";
    modal.style.display = modal.classList.contains("hidden") ? "none" : "flex";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.style.padding = "16px";
    modal.style.background = "rgba(0,0,0,0.8)";
    modal.style.pointerEvents = modal.classList.contains("hidden") ? "none" : "auto";

    content = modal.querySelector(".details-card");
    if (!content) {
      modal.innerHTML = `
        <div class="details-card" style="
          width:min(980px, 96vw);
          max-height:92vh;
          overflow:auto;
          border-radius:16px;
          background: var(--panel-bg, rgba(20,20,24,0.98));
          color: var(--text, #f2f2f4);
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        ">
          <div class="details-head" style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <div class="details-title" style="font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Match Details</div>
            <div style="display:flex;gap:8px;">
              <button class="btn-slim" data-act="reload">Reload</button>
              <button class="btn-slim" data-act="close">×</button>
            </div>
          </div>
          <div class="details-body" style="padding:14px;">
            <div class="muted">Loading…</div>
          </div>
        </div>`;
      content = modal.querySelector(".details-card");
    }

    // Close / reload handlers (delegation)
    modal.onclick = (e) => {
      const t = e.target;
      const actBtn = t && t.closest ? t.closest("[data-act]") : null;
      const act = actBtn ? String(actBtn.getAttribute("data-act") || "") : "";

      if (act === "close") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (act === "reload") { e.preventDefault(); e.stopPropagation(); if (currentMatch) open(currentMatch, true); return; }

      // click outside card closes
      if (t === modal) close();
    };
  }

  function isOpen() {
    ensureModal();
    return !modal.classList.contains("hidden");
  }

  function show() {
    ensureModal();
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.style.pointerEvents = "auto";
  }

  function hide() {
    ensureModal();
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.style.pointerEvents = "none";
  }

  function setTitle(text) {
    ensureModal();
    const el = modal.querySelector(".details-title");
    if (el) el.textContent = text || "Match Details";
  }

  function setBody(html) {
    ensureModal();
    const el = modal.querySelector(".details-body");
    if (el) el.innerHTML = html;
  }

  let currentMatch = null;

  async function open(match, forceReload) {
    if (!match) return;
    currentMatch = match;

    show();

    const title = `${match.home || ""} - ${match.away || ""}`.trim();
    setTitle(title || "Match Details");
    setBody(`<div class="muted">Loading…</div>`);

    if (!window.DetailsPanel || typeof window.DetailsPanel.loadAndRender !== "function") {
      setBody(`<div class="muted">DetailsPanel missing.</div>`);
      return;
    }

    try {
      await window.DetailsPanel.loadAndRender(match, modal.querySelector(".details-body"), { forceReload: !!forceReload });
    } catch (err) {
      const msg = esc(err && err.message ? err.message : String(err || "unknown error"));
      setBody(`<div class="muted">Failed to load details: ${msg}</div>`);
    }
  }

  function close() {
    hide();
  }

  // ESC close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });

  // Event bus listeners
  on("details-open", (p) => {
    const m = p?.match || p;
    if (m) open(m);
  });
  on("details:open", (p) => {
    const m = p?.match || p;
    if (m) open(m);
  });
  on("match-details", (p) => {
    const m = p?.match || p;
    if (m) open(m);
  });

  window.DetailsModal = {
    __ver: VER,
    open,
    close,
    isOpen
  };

  // Ensure modal exists early (prevents first-click race)
  ensureModal();
})();