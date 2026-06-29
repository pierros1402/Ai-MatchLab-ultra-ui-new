/* AIML_TOPBAR_BUILD: MODAL_DATE_RANGE_V8_FINAL_FLOW */
/* =========================================================
   TOPBAR INTERACTIONS (FINAL)
   - Home
   - Refresh
   - Export (Value Picks CSV)  [ADMIN ONLY]
   - Admin Unlock (Ctrl+Shift+E)
========================================================= */

(function () {
  "use strict";

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function formatDateYYYYMMDD(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Greece-safe today (Europe/Athens)
  function getTodayAthensYYYYMMDD() {
    const dt = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Athens",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(dt);

    const map = {};
    parts.forEach(p => { if (p.type !== "literal") map[p.type] = p.value; });
    return `${map.year}-${map.month}-${map.day}`;
  }

  function addDays(yyyyMmDd, deltaDays) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + deltaDays);
    return formatDateYYYYMMDD(base);
  }

  function getValueBase() {
    return (window.AIML_VALUE_CFG && window.AIML_VALUE_CFG.valueBase)
      ? window.AIML_VALUE_CFG.valueBase
      : "";
  }

  function closeOnOutside(menuEl, btnEl) {
    document.addEventListener("pointerdown", (e) => {
      if (!menuEl || !btnEl) return;

      // ✅ Do not close export menu while the date modal is open
      const dateModal = document.getElementById("aiml-date-modal");
      const dateModalOpen = dateModal && dateModal.style.display === "flex";
      if (dateModalOpen) return;

      const insideMenu = menuEl.contains(e.target);
      const insideBtn = btnEl.contains(e.target);
      if (!insideMenu && !insideBtn) {
        menuEl.classList.add("hidden");
        menuEl.setAttribute("aria-hidden", "true");
      }
    });
  }

  function toggleHidden(el) {
    if (!el) return;
    const isHidden = el.classList.contains("hidden");
    if (isHidden) {
      el.classList.remove("hidden");
      el.setAttribute("aria-hidden", "false");
    } else {
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    }
  }

  // -------------------------------------------------------
  // Home / Refresh
  // -------------------------------------------------------
  const btnHome = $("btn-home");
  const btnRefresh = $("btn-refresh");

// -------------------------------------------------------
// Update (online-only, no SW) — cache-bust reload
// -------------------------------------------------------
const btnUpdate = document.getElementById("btn-update");
if (btnUpdate) {
  btnUpdate.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(Date.now())); // cache-bust
    window.location.replace(url.toString());
  });
}

  if (btnHome) {
    btnHome.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (window.emit) window.emit("ui:home");
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      if (window.emit) window.emit("ui:refresh");
      if (window.emit) window.emit("fixtures:refresh");
      if (window.emit) window.emit("value:refresh");
    });
  }

  // -------------------------------------------------------
  // Export Menu (ADMIN ONLY)
  // -------------------------------------------------------
  const btnExport = $("btn-export");
  const exportMenu = $("export-menu");

  function buildExportMenu() {
    
    function toISODateGR(d = new Date()) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    }
if (!exportMenu) return;

    // --- helpers ---
    const pad2 = (n) => String(n).padStart(2, "0");
    const toISODateLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    function clampRange(a, b) {
      if (!a || !b) return { from: a || b, to: b || a };
      return a <= b ? { from: a, to: b } : { from: b, to: a };
    }

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const DEFAULT_DAYS_BACK = 60;

    exportMenu.innerHTML = `
      <div class="menu-title">Export</div>

      <div class="export-range-row" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:12px;opacity:.85;">From</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input id="export-from" type="text" placeholder="YYYY-MM-DD" readonly>
            <button id="export-from-open" class="menu-btn" style="height:34px;min-width:38px;">📅</button>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;">
          <label style="font-size:12px;opacity:.85;">To</label>
          <div style="display:flex;align-items:center;gap:6px;">
            <input id="export-to" type="text" placeholder="YYYY-MM-DD" readonly>
            <button id="export-to-open" class="menu-btn" style="height:34px;min-width:38px;">📅</button>
          </div>
        </div>

        <button id="export-pick" class="menu-btn" style="height:34px;">Pick</button>
        <button id="export-today" class="menu-btn" style="height:34px;">Today</button>
      </div>

      <div id="export-pickboard" class="hidden" style="
        margin-top:10px;
        padding:10px;
        border:1px solid rgba(255,255,255,.12);
        border-radius:14px;
        background:rgba(0,0,0,.18);
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-size:12px;opacity:.85;">Select range (click start, then end)</div>
          <button id="export-pick-close" class="menu-btn">Close</button>
        </div>

        <div id="export-days-grid" style="
          display:grid;
          grid-template-columns:repeat(7, 1fr);
          gap:6px;
          max-height:210px;
          overflow:auto;
          padding-right:4px;
        "></div>
      </div>

      <div class="menu-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="export-assessment" class="menu-btn">Assessment</button>
        <button id="export-value" class="menu-btn">Value</button>
      </div>
    `;
const elFrom = exportMenu.querySelector("#export-from");
    const elTo   = exportMenu.querySelector("#export-to");

    const btnFromOpen = exportMenu.querySelector("#export-from-open");
    const btnToOpen   = exportMenu.querySelector("#export-to-open");

    // open custom date modal (desktop safe)
    btnFromOpen?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.AIML_EXPORT_DATE_MODAL?.open) window.AIML_EXPORT_DATE_MODAL.open(elFrom);
      else elFrom?.focus();
    });

    btnToOpen?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.AIML_EXPORT_DATE_MODAL?.open) window.AIML_EXPORT_DATE_MODAL.open(elTo);
      else elTo?.focus();
    });

    // also open when clicking the input itself
    elFrom?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.AIML_EXPORT_DATE_MODAL?.open) window.AIML_EXPORT_DATE_MODAL.open(elFrom);
    });

    elTo?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.AIML_EXPORT_DATE_MODAL?.open) window.AIML_EXPORT_DATE_MODAL.open(elTo);
    });
    // style via JS (prevents broken HTML rendering)
    elFrom.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:#fff;";
    elTo.style.cssText   = "padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:#fff;";

setInputs(today, today);
const btnPick = exportMenu.querySelector("#export-pick");
    const btnToday = exportMenu.querySelector("#export-today");    const pickBoard = exportMenu.querySelector("#export-pickboard");
    const pickClose = exportMenu.querySelector("#export-pick-close");
    const grid = exportMenu.querySelector("#export-days-grid");

    // state for 2-click range
    let pickStart = null; // iso
    let pickEnd = null;   // iso

    function setInputs(from, to) {
      elFrom.value = from;
      elTo.value = to;
    }

    function openPick(open) {
      if (open) pickBoard.classList.remove("hidden");
      else pickBoard.classList.add("hidden");
    }

    function renderGrid() {
      grid.innerHTML = "";

      const base = new Date();
      base.setHours(0, 0, 0, 0);

      const days = [];
      for (let i = 0; i < DEFAULT_DAYS_BACK; i++) {
        const d = new Date(base.getTime() - i * 86400000);
        days.push(d);
      }
      days.reverse(); // oldest -> newest

      const currentFrom = elFrom.value || today;
      const currentTo = elTo.value || today;
      const rr = clampRange(pickStart || currentFrom, pickEnd || currentTo);
      const from = rr.from, to = rr.to;

      days.forEach((d) => {
        const iso = toISODateLocal(d);
        const label = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "menu-btn";
        cell.style.padding = "8px 6px";
        cell.style.borderRadius = "12px";
        cell.style.fontSize = "12px";
        cell.style.lineHeight = "1";
        cell.dataset.iso = iso;
        cell.textContent = label;

        // highlight range
        if (iso >= from && iso <= to) {
          cell.style.outline = "2px solid rgba(255,165,0,.55)";
          cell.style.background = "rgba(255,165,0,.12)";
        }
        if (iso === from || iso === to) {
          cell.style.outline = "2px solid rgba(255,165,0,.95)";
          cell.style.background = "rgba(255,165,0,.22)";
        }

        cell.addEventListener("click", () => {
          if (!pickStart || (pickStart && pickEnd)) {
            pickStart = iso;
            pickEnd = null;
            setInputs(iso, iso);
          } else {
            pickEnd = iso;
            const rrr = clampRange(pickStart, pickEnd);
            setInputs(rrr.from, rrr.to);
          }
          renderGrid();
        });

        grid.appendChild(cell);
      });
    }

    // manual changes
    elFrom.addEventListener("change", () => setInputs(elFrom.value || today, elTo.value || today));
    elTo.addEventListener("change", () => setInputs(elFrom.value || today, elTo.value || today));

    // quick buttons
    // quick buttons
btnToday.addEventListener("click", () => setInputs(today, today));

    // pickboard
    btnPick.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = pickBoard.classList.contains("hidden");
      openPick(willOpen);
      if (willOpen) {
        pickStart = elFrom.value || today;
        pickEnd = elTo.value || today;
        renderGrid();
      }
    });

    pickClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPick(false);
    });

    // DIRECT DOWNLOAD via MAIN
    function getRange() {
      return clampRange(elFrom.value || today, elTo.value || today);
    }

    function getAdminToken() {
      // Uses same token you use for admin unlock (Ctrl+Shift+E)
      // If not set, fallback to "1234" (you can change this)
      return localStorage.getItem("aiml_admin_token") || "1234";
    }

    const MAIN_BASE =
      (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
        ? window.AIML_LIVE_CFG.fixturesBase
        : "http://localhost:3010";

    exportMenu.querySelector("#export-assessment")?.addEventListener("click", () => {
      const r = getRange();
      const token = getAdminToken();
      const url = `${MAIN_BASE}/assessment-export/range?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&format=xlsx&token=${encodeURIComponent(token)}`;
      window.open(url, "_blank");
    });

    exportMenu.querySelector("#export-value")?.addEventListener("click", () => {
      const r = getRange();
      const token = getAdminToken();
      const url = `${MAIN_BASE}/value-export/range?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&format=xlsx&token=${encodeURIComponent(token)}`;
      window.open(url, "_blank");
    });
  }

  if (btnExport && exportMenu) {
    buildExportMenu();

    btnExport.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleHidden(exportMenu);
    });

    closeOnOutside(exportMenu, btnExport);
  }

  // -------------------------------------------------------
  // Admin unlock (local only)
  // -------------------------------------------------------
  function enableAdmin() {
    document.body.classList.add("aiml-admin");
    document.documentElement.classList.add("aiml-admin");
  }

  // Admin mode is permanently active — this is a single-operator platform.
  enableAdmin();

})();


/* =====================================================
   EXPORT DATE MODAL (custom date picker - desktop safe)
===================================================== */
(function () {
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmt(d) {
    if (!(d instanceof Date)) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || "").trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2] - 1, da = +m[3];
    const d = new Date(y, mo, da);
    if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
    return d;
  }

  function ensureModal() {
    let modal = document.getElementById("aiml-date-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "aiml-date-modal";
    modal.style.cssText = `
      position:fixed; inset:0; z-index:999999;
      display:none; align-items:center; justify-content:center;
      background:rgba(0,0,0,.55);
    `;

    modal.innerHTML = `
      <div id="aiml-date-card" style="
        width:320px; max-width:92vw;
        background:rgba(15,18,24,.98);
        border:1px solid rgba(255,255,255,.12);
        border-radius:18px;
        box-shadow:0 18px 60px rgba(0,0,0,.45);
        padding:14px;
        color:#fff;
        font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <button id="aiml-cal-prev" class="menu-btn" style="min-width:40px;">‹</button>
          <div id="aiml-cal-title" style="font-weight:700;opacity:.95;"></div>
          <button id="aiml-cal-next" class="menu-btn" style="min-width:40px;">›</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px;font-size:12px;opacity:.75;text-align:center;">
          <div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div><div>Su</div>
        </div>

        <div id="aiml-cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px;"></div>

        <div style="display:flex;justify-content:space-between;gap:10px;margin-top:12px;">
          <button id="aiml-cal-today" class="menu-btn">Today</button>
          <button id="aiml-cal-close" class="menu-btn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Prevent any global "outside click" handlers (menus) from closing things while picking dates
  //modal.addEventListener("pointerdown", (e) => { e.stopPropagation(); }, true);
  //modal.addEventListener("mousedown", (e) => { e.stopPropagation(); }, true);
  //modal.addEventListener("click", (e) => { e.stopPropagation(); }, true);

    // click outside closes
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideModal();
    });

    // ESC closes
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideModal();
    });

    return modal;
  }

  let activeInput = null;
  let viewDate = new Date();

  function monthTitle(d) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function mondayIndex(jsDay) {
    // JS: 0=Sun..6=Sat => want 0=Mon..6=Sun
    return (jsDay + 6) % 7;
  }

  function render() {
    const modal = ensureModal();
    const title = modal.querySelector("#aiml-cal-title");
    const grid  = modal.querySelector("#aiml-cal-grid");
    title.textContent = monthTitle(viewDate);

    grid.innerHTML = "";

    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();

    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startOffset = mondayIndex(first.getDay());

    // blanks
    for (let i=0;i<startOffset;i++){
      const b=document.createElement("div");
      b.style.height="34px";
      grid.appendChild(b);
    }

    const today = new Date();
    const todayISO = fmt(today);
    const selectedISO = activeInput ? activeInput.value : "";

    for (let day=1; day<=daysInMonth; day++){
      const d=new Date(y,m,day);
      const iso=fmt(d);

      const btn=document.createElement("button");
      btn.type="button";
      btn.textContent=String(day);
      btn.style.cssText = `
        height:34px;
        border-radius:10px;
        border:1px solid rgba(255,255,255,.10);
        background:rgba(255,255,255,.06);
        color:#fff;
        cursor:pointer;
      `;

      if (iso === todayISO){
        btn.style.borderColor="rgba(255,255,255,.35)";
      }
      if (iso === selectedISO){
        btn.style.background="rgba(255,255,255,.18)";
        btn.style.borderColor="rgba(255,255,255,.35)";
      }

      btn.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        const targetId = window.__AIML_EXPORT_TARGET_ID;
        const targetEl = targetId ? document.getElementById(targetId) : null;
        if (!targetEl) { hideModal(); return; }

        targetEl.value = iso;
        targetEl.dispatchEvent(new Event("change", { bubbles:true }));

        // ✅ Range flow (final):
        // - If we were picking FROM -> switch to TO and keep modal open
        // - If we were picking TO -> close modal
        const pickedTarget = window.__AIML_EXPORT_TARGET_ID || null;

        if (pickedTarget === "export-from") {
          const toEl = document.getElementById("export-to");
          if (toEl) {
            window.__AIML_EXPORT_TARGET_ID = "export-to";
            activeInput = toEl;

            // keep same month view unless TO already has a month
            const toParsed = parseISO(toEl.value);
            const base = toParsed || new Date(y, m, 1);
            viewDate = new Date(base.getFullYear(), base.getMonth(), 1);

            render();
            return; // keep modal open
          }
        }

        // picked TO (or fallback) => close
        hideModal();

      });

      grid.appendChild(btn);
    }

    // nav
    modal.querySelector("#aiml-cal-prev").onclick = (e) => {
      e.preventDefault();
      viewDate = new Date(y, m - 1, 1);
      render();
    };
    modal.querySelector("#aiml-cal-next").onclick = (e) => {
      e.preventDefault();
      viewDate = new Date(y, m + 1, 1);
      render();
    };
    modal.querySelector("#aiml-cal-close").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      hideModal();
    };
    modal.querySelector("#aiml-cal-today").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const t = new Date();
      viewDate = new Date(t.getFullYear(), t.getMonth(), 1);

      const targetId = window.__AIML_EXPORT_TARGET_ID || (activeInput && activeInput.id) || null;
      const targetEl = targetId ? document.getElementById(targetId) : null;

      if (!targetEl) { hideModal(); return; }

      targetEl.value = fmt(t);
      targetEl.dispatchEvent(new Event("change", { bubbles:true }));

      // If we set FROM, continue to TO without closing
      if (window.__AIML_EXPORT_TARGET_ID === "export-from") {
        const toEl = document.querySelector("#export-to");
        if (toEl) {
          activeInput = toEl;
            window.__AIML_EXPORT_TARGET_ID = "export-to";
          // keep modal open; re-render highlights
          render();
          return;
        }
      }

      hideModal();
    };
  }

  function showModal(forInput) {
    window.__AIML_EXPORT_TARGET_ID = forInput && forInput.id ? forInput.id : null;

    activeInput = forInput;
    const modal = ensureModal();

    const cur = parseISO(forInput.value);
    const base = cur || new Date();
    viewDate = new Date(base.getFullYear(), base.getMonth(), 1);

    modal.style.display = "flex";
    render();
  }

  function hideModal() {
    const modal = document.getElementById("aiml-date-modal");
    if (modal) modal.style.display = "none";
    activeInput = null;
  }

  // expose globally so export menu can call it safely
  window.AIML_EXPORT_DATE_MODAL = {
    open: showModal
  };
})();