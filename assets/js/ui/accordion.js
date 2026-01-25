// ---- ACCORDION INIT GUARD (SAFE) ----
window.__AIML_ACCORDION_INITIALIZED__ =
  window.__AIML_ACCORDION_INITIALIZED__ || false;

if (!window.__AIML_ACCORDION_INITIALIZED__) {
  window.__AIML_ACCORDION_INITIALIZED__ = true;

  // ⬇️ ΟΛΟΣ ο υπάρχων κώδικας init του accordion
  // (ΔΕΝ αλλάζεις τίποτα άλλο)
}


// =====================================================
// ACCORDION — STABLE SINGLE-OPEN WITH SELECTIVE TOGGLE
// =====================================================

(function () {
  const accordion = document.getElementById("left-accordion");
  if (!accordion) return;

  // Panels that are autonomous (toggle freely)
  const AUTONOMOUS = new Set([
    "panel-today",
    "panel-saved"
  ]);

  // Panels that should toggle BUT still belong to main flow
  const TOGGLE_MAIN = new Set([
    "panel-active-leagues",
    "panel-league-details"
  ]);

  function closeAllMainPanels(exceptId) {
    const panels = accordion.querySelectorAll(".accordion-panel");
    panels.forEach(panel => {
      const id = panel.id;
      if (!id) return;

      if (
        AUTONOMOUS.has(id) ||
        TOGGLE_MAIN.has(id) ||
        id === exceptId
      ) {
        return;
      }

      panel.style.display = "none";
      panel.parentElement.classList.remove("open");
    });
  }

  function openPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;

    panel.style.display = "block";
    panel.parentElement.classList.add("open");
  }

  function closePanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;

    panel.style.display = "none";
    panel.parentElement.classList.remove("open");
  }

  function isOpen(id) {
    const panel = document.getElementById(id);
    if (!panel) return false;
    return panel.style.display !== "none";
  }

  accordion.addEventListener("click", (e) => {
    const header = e.target.closest(".accordion-header");
    if (!header) return;

    const id = header.getAttribute("data-target");
    if (!id) return;

    // 1) Autonomous panels (Today, Saved)
    if (AUTONOMOUS.has(id)) {
      if (isOpen(id)) closePanel(id);
      else openPanel(id);
      return;
    }

    // 2) Toggle-main panels (Active Leagues, League Details)
    if (TOGGLE_MAIN.has(id)) {
      if (isOpen(id)) {
        closePanel(id);
      } else {
        closeAllMainPanels(id);
        openPanel(id);
      }
      return;
    }

    // 3) Default main flow (single-open, no toggle)
    closeAllMainPanels(id);
    openPanel(id);
  });

  // Init: hide all panels EXCEPT autonomous (Today, Saved)
const panels = accordion.querySelectorAll(".accordion-panel");
panels.forEach(panel => {
  const id = panel.id;
  if (!id) return;

  if (AUTONOMOUS.has(id)) {
    panel.style.display = "block";
    panel.parentElement.classList.add("open");
    return;
  }

  panel.style.display = "none";
  panel.parentElement.classList.remove("open");
});
})();
