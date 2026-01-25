/* assets/js/mobile-ui.js
   FINAL MOBILE UI
   - Tabs (LEFT / ODDS / RIGHT) with "hide active tab"
   - LEFT panels open/close (mobile)
   - RIGHT panels open/close (mobile)
*/

(function () {
  "use strict";
  if (window.__AIML_MOBILE_UI__) return;
  window.__AIML_MOBILE_UI__ = true;

  const MQ = window.matchMedia("(max-width: 900px)");

  function isMobile() {
    return MQ && MQ.matches;
  }

  function updateTabs(view) {
    document.querySelectorAll(".mobile-tab").forEach((b) => {
      const active = b.dataset.view === view;
      b.classList.toggle("active", active);

      // ✅ Hide the current view button (show only the other 2)
      b.style.display = active ? "none" : "inline-flex";
    });
  }

  function setView(view) {
    document.body.classList.remove("mobile-view-left", "mobile-view-odds", "mobile-view-right");
    document.body.classList.add("mobile-view-" + view);
    updateTabs(view);
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

    const right = document.getElementById("right-panel");
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

    // default view
    setView("left");
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
