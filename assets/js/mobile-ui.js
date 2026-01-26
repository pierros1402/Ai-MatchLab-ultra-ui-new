/* assets/js/mobile-ui.js
   FINAL MOBILE UI (LOCKED)
   - Tabs (LEFT / ODDS / RIGHT) hide active tab (show only the other 2)
   - HARD show/hide panels (display) => guaranteed switching
   - Remembers last view (localStorage)
   - LEFT accordion mobile
   - RIGHT accordion mobile
*/

(function () {
  "use strict";
  if (window.__AIML_MOBILE_UI__) return;
  window.__AIML_MOBILE_UI__ = true;

  const MQ = window.matchMedia("(max-width: 900px)");
  const STORAGE_KEY = "AIML_MOBILE_VIEW";

  function isMobile() {
    return MQ && MQ.matches;
  }

  function getEls() {
    const left = document.querySelector(".left-column");
    const odds = document.querySelector("#odds-intelligence-center") || document.querySelector(".center-column");
    const right =
      document.querySelector("aside.right-column") ||
      document.querySelector(".right-column") ||
      document.getElementById("right-panel");

    return { left, odds, right };
  }

  function updateTabs(view) {
    document.querySelectorAll(".mobile-tab").forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);

      // Hide the current view button (show only the other 2)
      b.style.display = active ? "none" : "inline-flex";
    });
  }

  function saveView(view) {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch (_) {}
  }

  function loadView() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "left" || v === "odds" || v === "right") return v;
    } catch (_) {}
    return null;
  }

  function hardApply(view) {
    const { left, odds, right } = getEls();
    if (!left || !odds || !right) return;

    // Hide all 3
    left.style.display = "none";
    odds.style.display = "none";
    right.style.display = "none";

    // Show selected
    if (view === "left") left.style.display = "block";
    if (view === "odds") odds.style.display = "block";
    if (view === "right") right.style.display = "block";
  }

  function setView(view) {
    if (view !== "left" && view !== "odds" && view !== "right") view = "left";

    document.body.classList.remove("mobile-view-left", "mobile-view-odds", "mobile-view-right");
    document.body.classList.add("mobile-view-" + view);

    if (isMobile()) {
      hardApply(view);
    }

    updateTabs(view);
    saveView(view);
  }

  function initTabs() {
    const tabs = document.getElementById("mobile-tabs");
    if (!tabs) return;

    if (tabs.dataset.bound === "1") return;
    tabs.dataset.bound = "1";

    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".mobile-tab");
      if (!btn) return;
      setView(btn.dataset.view);
    });
  }

  function initLeftAccordionMobile() {
    if (!isMobile()) return;

    const leftCol = document.querySelector(".left-column");
    if (!leftCol) return;

    const panels = leftCol.querySelectorAll(".panel");
    if (!panels.length) return;

    if (leftCol.dataset.bound === "1") return;
    leftCol.dataset.bound = "1";

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
      const header = e.target.closest(".panel-header");
      if (!header) return;

      const panel = header.closest(".panel");
      if (!panel) return;

      const body = panel.querySelector(".panel-body");
      if (!body) return;

      const wasOpen = !body.hidden;

      panels.forEach((p) => {
        const b = p.querySelector(".panel-body");
        if (!b) return;
        b.hidden = true;
        p.classList.remove("open");
      });

      body.hidden = wasOpen;
      panel.classList.toggle("open", !body.hidden);
    });
  }

  function initRightAccordionMobile() {
    if (!isMobile()) return;

    const right =
      document.getElementById("right-panel") ||
      document.querySelector("aside.right-column") ||
      document.querySelector(".right-column");

    if (!right) return;

    if (right.dataset.bound === "1") return;
    right.dataset.bound = "1";

    right.addEventListener("click", (e) => {
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
    if (!isMobile()) return;

    initTabs();
    initLeftAccordionMobile();
    initRightAccordionMobile();

    // IMPORTANT: DO NOT force left every time.
    const saved = loadView();
    if (saved) {
      setView(saved);
      return;
    }

    // If no saved view, keep existing body class or fallback left
    const current =
      document.body.classList.contains("mobile-view-odds") ? "odds" :
      document.body.classList.contains("mobile-view-right") ? "right" :
      document.body.classList.contains("mobile-view-left") ? "left" :
      "left";

    setView(current);
  }

  function onReady() {
    boot();

    if (MQ && MQ.addEventListener) {
      MQ.addEventListener("change", () => {
        if (isMobile()) boot();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }

  window.AIML_MOBILE_SET_VIEW = setView;
})();
