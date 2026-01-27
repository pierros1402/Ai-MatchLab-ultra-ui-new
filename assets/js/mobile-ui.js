/* assets/js/mobile-ui.js
   MOBILE UI (DROPDOWN + MOBILE VIEWS + ACCORDIONS)
   - Acts ONLY on mobile (<=900px)
   - Desktop is ALWAYS restored (no inline display locks)
   - LEFT/ODDS/RIGHT view switching
   - Mobile accordions (left + right)
*/

(function () {
  "use strict";

  // Prevent double init
  if (window.__AIML_MOBILE_UI__) return;
  window.__AIML_MOBILE_UI__ = true;

  const MQ = window.matchMedia("(max-width: 900px)");

  function isMobile() {
    return MQ && MQ.matches;
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function getPanels() {
     const left = document.querySelector("aside.left-column") || document.querySelector(".left-column");
     const odds = 
       document.getElementById("odds-intelligence-center") ||
       document.querySelector(".center-column");
     const right =
       document.querySelector("aside.right-column") ||
       document.querySelector(".right-column");
    return { left, odds, right };
  }

  function clearInlineDisplay() {
    const { left, odds, right } = getPanels();
    if (left) left.style.display = "";
    if (odds) odds.style.display = "";
    if (right) right.style.display = "";
  }

  function restoreDesktop() {
    clearInlineDisplay();

    document.body.classList.remove(
      "mobile-view-left",
      "mobile-view-odds",
      "mobile-view-right"
    );

    const menu = document.getElementById("mobile-view-menu");
    if (menu) menu.classList.add("hidden");

    const btn = document.getElementById("mobile-view-btn");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function hardApplyMobile(view) {
    const { left, odds, right } = getPanels();
    if (!left || !odds || !right) return;
    if (!isMobile()) return;

    left.style.display = "none";
    odds.style.display = "none";
    right.style.display = "none";

    if (view === "left") left.style.display = "block";
    if (view === "odds") odds.style.display = "block";
    if (view === "right") right.style.display = "block";
  }

  function readSavedView() {
    try {
      const v = localStorage.getItem("AIML_MOBILE_VIEW");
      if (v === "left" || v === "odds" || v === "right") return v;
    } catch (_) {}
    return "left";
  }

  function saveView(view) {
    try {
      localStorage.setItem("AIML_MOBILE_VIEW", view);
    } catch (_) {}
  }

  function setView(view) {
    if (!isMobile()) return;

    if (view !== "left" && view !== "odds" && view !== "right") view = "left";

    document.body.classList.remove("mobile-view-left", "mobile-view-odds", "mobile-view-right");
    document.body.classList.add("mobile-view-" + view);

    const label = document.getElementById("mobile-view-label");
    if (label) label.textContent = view.toUpperCase();

    hardApplyMobile(view);
    saveView(view);
  }

  function initDropdown() {
    if (!isMobile()) return;

    const dd = document.getElementById("mobile-view-dd");
    const btn = document.getElementById("mobile-view-btn");
    const menu = document.getElementById("mobile-view-menu");

    if (!dd || !btn || !menu) return;
    if (dd.dataset.bound === "1") return;
    dd.dataset.bound = "1";

    function open() {
      menu.classList.remove("hidden");
      btn.setAttribute("aria-expanded", "true");
    }

    function close() {
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    }

    function toggle() {
      if (menu.classList.contains("hidden")) open();
      else close();
    }

    // Toggle dropdown
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });

    // Click menu item -> set view
    menu.addEventListener("click", (e) => {
      
      e.stopPropagation();

      const item = e.target.closest(".mobile-view-item");
      if (!item) return;

      const view = item.getAttribute("data-view");
      if (!view) return;

      setView(view);
      close();
    });

    // Outside click closes (capture avoids race)
    document.addEventListener(
      "click",
      (e) => {
        if (!isMobile()) return;
        if (menu.classList.contains("hidden")) return;
        if (dd.contains(e.target)) return;
        close();
      },
      false
    );

    // Escape closes
    document.addEventListener("keydown", (e) => {
      if (!isMobile()) return;
      if (e.key !== "Escape") return;
      if (menu.classList.contains("hidden")) return;
      close();
    });
  }

  function initLeftAccordion() {
    if (!isMobile()) return;

    const leftCol = document.querySelector("aside.left-column") || document.querySelector(".left-column");
    if (!leftCol) return;

    const panels = Array.from(leftCol.querySelectorAll(".panel"));
    if (!panels.length) return;

    if (leftCol.dataset.accordionBound === "1") return;
    leftCol.dataset.accordionBound = "1";

    // Default: Today open
    panels.forEach((p) => {
      const body = p.querySelector(".panel-body");
      if (!body) return;

      if (p.id === "panel-today") {
        body.hidden = false;
        p.classList.add("open");
      } else {
        body.hidden = true;
        p.classList.remove("open");
      }
    });

    leftCol.addEventListener("click", (e) => {
      if (!isMobile()) return;

      const header = e.target.closest(".panel-header");
      if (!header) return;

      const panel = header.closest(".panel");
      if (!panel) return;

      const body = panel.querySelector(".panel-body");
      if (!body) return;

      const wasOpen = !body.hidden;

      // close all
      panels.forEach((p) => {
        const b = p.querySelector(".panel-body");
        if (!b) return;
        b.hidden = true;
        p.classList.remove("open");
      });

      // toggle current
      body.hidden = wasOpen ? true : false;
      panel.classList.toggle("open", !body.hidden);
    });
  }

  function initRightAccordion() {
    if (!isMobile()) return;

    const right =
      document.getElementById("right-panel") ||
      document.querySelector("aside.right-column") ||
      document.querySelector(".right-column");

    if (!right) return;
    if (right.dataset.accordionBound === "1") return;
    right.dataset.accordionBound = "1";

    right.addEventListener("click", (e) => {
      if (!isMobile()) return;

      const header = e.target.closest(".intelligence-panel .panel-header");
      if (!header) return;

      const panel = header.closest(".intelligence-panel");
      if (!panel) return;

      right.querySelectorAll(".intelligence-panel.open").forEach((p) => {
        if (p !== panel) p.classList.remove("open");
      });

      panel.classList.toggle("open");
    });

    const first = right.querySelector(".intelligence-panel");
    if (first) first.classList.add("open");
  }

  function boot() {
    if (isMobile()) {
      initDropdown();
      initLeftAccordion();
      initRightAccordion();
      setView(readSavedView());
    } else {
      restoreDesktop();
    }
  }

  function onReady() {
    boot();

    if (MQ && MQ.addEventListener) {
      MQ.addEventListener("change", () => {
        boot();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }

  // Debug helper
  window.AIML_MOBILE_SET_VIEW = setView;
})();
