/* =====================================================
   AIMATCHLAB — PANEL STATE HELPER
   loading / empty / error / data
===================================================== */

(function () {
  "use strict";

  window.AIML_PANEL = window.AIML_PANEL || {};

  window.AIML_PANEL.ensureStateEl = function (panelEl) {
    if (!panelEl) return null;

    let el = panelEl.querySelector(".aiml-panel-state");
    if (!el) {
      el = document.createElement("div");
      el.className = "aiml-panel-state hidden";

      const body = panelEl.querySelector(".panel-body") || panelEl;
      body.insertBefore(el, body.firstChild);
    }
    return el;
  };

  window.AIML_PANEL.set = function (panelEl, state, text) {
    if (!panelEl) return;

    const stateEl = window.AIML_PANEL.ensureStateEl(panelEl);
    if (!stateEl) return;

    stateEl.classList.remove("hidden", "loading", "empty", "error");
    stateEl.textContent = String(text || "");

    if (state === "data") {
      stateEl.classList.add("hidden");
      return;
    }

    if (state === "loading") stateEl.classList.add("loading");
    else if (state === "empty") stateEl.classList.add("empty");
    else if (state === "error") stateEl.classList.add("error");
    else stateEl.classList.add("empty");
  };
})();