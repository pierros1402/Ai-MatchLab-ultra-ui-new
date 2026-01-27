// =====================================================
// ACCORDION — AI MATCHLAB ULTRA (PANEL-BASED)
// Targets:
//   #left-accordion
//   .panel
//   .panel-header
//   .panel-body
// Uses only class ".open"
// =====================================================

(function () {
  if (window.__AIML_LEFT_ACCORDION_BOUND__) return;
  window.__AIML_LEFT_ACCORDION_BOUND__ = true;

  const accordion = document.getElementById("left-accordion");
  if (!accordion) return;

  // Set true if you want only 1 open panel at a time
  const SINGLE_OPEN = true;

  const getPanels = () => Array.from(accordion.querySelectorAll(".panel"));

  function closeAllExcept(exceptPanel) {
    getPanels().forEach((p) => {
      if (p === exceptPanel) return;
      p.classList.remove("open");
    });
  }

  function toggle(panel) {
    if (!panel) return;

    const isOpen = panel.classList.contains("open");

    if (SINGLE_OPEN) {
      if (isOpen) {
        panel.classList.remove("open");
        return;
      }
      closeAllExcept(panel);
      panel.classList.add("open");
      return;
    }

    panel.classList.toggle("open");
  }

  accordion.addEventListener("click", (e) => {
    const header = e.target.closest(".panel-header");
    if (!header) return;

    const panel = header.closest(".panel");
    if (!panel) return;

    toggle(panel);
  });
})();
