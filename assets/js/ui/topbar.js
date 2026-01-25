/* =========================================================
   TOPBAR INTERACTIONS
   - Home
   - Refresh
   - Export (Value Picks CSV)  [ADMIN ONLY]
========================================================= */

(function () {

  // -------------------------------------------------------
  // Admin unlock (local only)
  // -------------------------------------------------------
  const ADMIN_PIN = "1234";
  const ADMIN_KEY = "aiml_admin_enabled";

  function enableAdmin() {
    document.body.classList.add("aiml-admin");
    localStorage.setItem(ADMIN_KEY, "1");
  }

  function disableAdmin() {
    document.body.classList.remove("aiml-admin");
    localStorage.removeItem(ADMIN_KEY);
  }

  // auto-restore admin if enabled on this device
  if (localStorage.getItem(ADMIN_KEY) === "1") {
    enableAdmin();
  }

  // unlock with Ctrl+Shift+E
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "e") {
      const pin = prompt("Admin PIN:");
      if (pin === ADMIN_PIN) enableAdmin();
      else alert("Wrong PIN");
    }

    // lock with Ctrl+Shift+L
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
      disableAdmin();
      alert("Admin locked");
    }
  });

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  function $(id) {
    return document.getElementById(id);
  }

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
    parts.forEach(p => {
      if (p.type !== "literal") map[p.type] = p.value;
    });

    return `${map.year}-${map.month}-${map.day}`;
  }

  function addDays(yyyyMmDd, deltaDays) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + deltaDays);
    return formatDateYYYYMMDD(base);
  }

  function toggleMenu(menuEl, open) {
    if (!menuEl) return;
    const isOpen = !menuEl.classList.contains("hidden");
    const next = typeof open === "boolean" ? open : !isOpen;

    if (next) {
      menuEl.classList.remove("hidden");
      menuEl.setAttribute("aria-hidden", "false");
    } else {
      menuEl.classList.add("hidden");
      menuEl.setAttribute("aria-hidden", "true");
    }
  }

  function closeMenusOnOutsideClick(menuEl, btnEl) {
    document.addEventListener("pointerdown", (e) => {
      if (!menuEl || !btnEl) return;
      const insideMenu = menuEl.contains(e.target);
      const insideBtn = btnEl.contains(e.target);
      if (!insideMenu && !insideBtn) toggleMenu(menuEl, false);
    });
  }

  function getValueBase() {
    return (window.AIML_VALUE_CFG && window.AIML_VALUE_CFG.valueBase)
      ? window.AIML_VALUE_CFG.valueBase
      : "";
  }

  // -------------------------------------------------------
  // Home / Refresh
  // -------------------------------------------------------

  const btnHome = $("btn-home");
  const btnRefresh = $("btn-refresh");

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
  // Export Menu (Daily / Range / Week)
  // -------------------------------------------------------

  const btnExport = $("btn-export");
  const exportMenu = $("export-menu");

  function buildExportMenu() {
    if (!exportMenu) return;

    const today = getTodayAthensYYYYMMDD();

    exportMenu.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">

        <div style="font-weight:800; opacity:.95;">Value Export (CSV)</div>

        <div style="display:flex; gap:8px; align-items:center;">
          <label style="opacity:.85; font-size:12px; min-width:36px;">From</label>
          <input id="export-from" type="date" value="${today}"
                 style="flex:1; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:rgba(17,26,42,.90); color:#fff; padding:0 8px;">
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
          <label style="opacity:.85; font-size:12px; min-width:36px;">To</label>
          <input id="export-to" type="date" value="${today}"
                 style="flex:1; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,.14); background:rgba(17,26,42,.90); color:#fff; padding:0 8px;">
        </div>

        <div style="display:flex; gap:8px;">
          <button id="export-daily"
            style="flex:1; height:30px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-weight:800; cursor:pointer;">
            Daily
          </button>

          <button id="export-3days"
            style="flex:1; height:30px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-weight:800; cursor:pointer;">
            3 Days
          </button>

          <button id="export-week"
            style="flex:1; height:30px; border-radius:10px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:inherit; font-weight:800; cursor:pointer;">
            Week
          </button>
        </div>

        <button id="export-download"
          style="height:34px; border-radius:12px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.10); color:inherit; font-weight:900; cursor:pointer;">
          Download CSV
        </button>

        <div style="font-size:12px; opacity:.75; line-height:1.25;">
          Exports one CSV containing picks for the selected range.
        </div>

      </div>
    `;

    const fromEl = $("export-from");
    const toEl = $("export-to");

    const btnDaily = $("export-daily");
    const btn3 = $("export-3days");
    const btnWeek = $("export-week");
    const btnDownload = $("export-download");

    function setRange(days) {
      // range ends today, starts (today - days + 1)
      const end = getTodayAthensYYYYMMDD();
      const start = addDays(end, -(days - 1));
      if (fromEl) fromEl.value = start;
      if (toEl) toEl.value = end;
    }

    if (btnDaily) {
      btnDaily.addEventListener("click", () => setRange(1));
    }
    if (btn3) {
      btn3.addEventListener("click", () => setRange(3));
    }
    if (btnWeek) {
      btnWeek.addEventListener("click", () => setRange(7));
    }

    if (btnDownload) {
      btnDownload.addEventListener("click", () => {
        const base = getValueBase();
        const from = fromEl && fromEl.value ? fromEl.value : today;
        const to = toEl && toEl.value ? toEl.value : today;

        // cache-bust for guaranteed fresh
        const t = Date.now();

        const url = `${base}/value-export/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=csv&t=${t}&token=1234`;

        window.open(url, "_blank");
        toggleMenu(exportMenu, false);
      });
    }
  }

  // ✅ UPDATED BLOCK (Force open/close, no toggleMenu)
  if (btnExport && exportMenu) {
    buildExportMenu();

    btnExport.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // force open/close
      const isHidden = exportMenu.classList.contains("hidden");
      if (isHidden) {
        exportMenu.classList.remove("hidden");
        exportMenu.setAttribute("aria-hidden", "false");
      } else {
        exportMenu.classList.add("hidden");
        exportMenu.setAttribute("aria-hidden", "true");
      }
    });

    closeMenusOnOutsideClick(exportMenu, btnExport);
  }

})();
// =====================================================
// TOPBAR INIT (required)
// =====================================================
window.AIML_TOPBAR_INIT = function AIML_TOPBAR_INIT(){
  // You can keep this empty for now.
  // The important thing: it must exist so tools and admin work consistently.
};

// =====================================================
// ADMIN UNLOCK (Ctrl+Shift+E) — ALWAYS ACTIVE
// =====================================================
(function(){
  const ADMIN_KEY = "aiml_admin_enabled";
  const ADMIN_PIN = "1234";

  function applyAdminClass(){
    try{
      if(localStorage.getItem(ADMIN_KEY) === "1"){
        document.body.classList.add("aiml-admin");
        document.documentElement.classList.add("aiml-admin");
      }
    }catch(e){}
  }

  function enableAdmin(){
    try{
      localStorage.setItem(ADMIN_KEY, "1");
      document.body.classList.add("aiml-admin");
      document.documentElement.classList.add("aiml-admin");
      alert("ADMIN MODE ENABLED ✅");
    }catch(e){
      console.warn("[admin] enable failed", e);
    }
  }

  function disableAdmin(){
    try{
      localStorage.removeItem(ADMIN_KEY);
      document.body.classList.remove("aiml-admin");
      document.documentElement.classList.remove("aiml-admin");
      alert("ADMIN MODE DISABLED");
    }catch(e){
      console.warn("[admin] disable failed", e);
    }
  }

  // apply admin class on load (if enabled)
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", applyAdminClass, { once:true });
  } else {
    applyAdminClass();
  }

  window.addEventListener("keydown", (e) => {
    const isCombo = e.ctrlKey && e.shiftKey && (e.code === "KeyE" || (e.key && e.key.toLowerCase() === "e"));
    if(!isCombo) return;

    e.preventDefault();

    const already = (localStorage.getItem(ADMIN_KEY) === "1");
    if(already){
      if(confirm("Disable ADMIN MODE?")) disableAdmin();
      return;
    }

    const pin = prompt("Enter ADMIN PIN:");
    if(pin === ADMIN_PIN) enableAdmin();
    else if(pin !== null) alert("Wrong PIN");
  });
})();
