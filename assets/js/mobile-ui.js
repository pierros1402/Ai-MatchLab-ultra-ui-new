/* mobile-ui.js (clean: mobile-only + safe reset + aria focus fix) */

(() => {
  const dd = document.getElementById("mobile-view-dd");
  const btn = document.getElementById("mobile-view-btn");
  const menu = document.getElementById("mobile-view-menu");

  function getPanels() {
    return {
      left: document.querySelector(".left-column"),
      odds: document.getElementById("odds-intelligence-center"),
      right:
        document.querySelector("aside.right-column") ||
        document.querySelector(".right-column") ||
        document.getElementById("right-panel")
    };
  }

  // elements must exist
  if (!dd || !btn || !menu) return;

  // ✅ helper: detect mobile
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  // ✅ helper: clear inline display so desktop CSS can take over
function resetDesktopPanels() {
  document.body.classList.remove(
    "mobile-view-left",
    "mobile-view-odds",
    "mobile-view-right"
  );

  const { left, odds, right } = getPanels();
  if (left) left.style.removeProperty("display");
  if (odds) odds.style.removeProperty("display");
  if (right) right.style.removeProperty("display");
}

  function hideMenu() {
    // ✅ Fix: do not hide a container while a focused element lives inside it
    const active = document.activeElement;
    if (active && menu.contains(active)) active.blur();

    menu.classList.add("hidden");
    menu.setAttribute("aria-hidden", "true");
  }

  function showMenu() {
    menu.classList.remove("hidden");
    menu.setAttribute("aria-hidden", "false");
  }

  function setLabel(text) {
    const labelEl =
      document.getElementById("mobile-view-label") ||
      btn.querySelector(".mobile-view-label");

    if (labelEl) labelEl.textContent = text;
  }

function setView(view) {
  if (!isMobile()) {
    resetDesktopPanels();
    hideMenu();
    return;
  }

  document.body.classList.remove("mobile-view-left", "mobile-view-odds", "mobile-view-right");

  if (view === "odds") {
    document.body.classList.add("mobile-view-odds");
    setLabel("ODDS");
  } else if (view === "right") {
    document.body.classList.add("mobile-view-right");
    setLabel("RIGHT");
  } else {
    document.body.classList.add("mobile-view-left");
    setLabel("LEFT");
  }

  hideMenu();
}

  // ✅ public API used by matches-panel.js (keep it)
  window.AIML_MOBILE_SET_VIEW = setView;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // only functional on mobile
    if (!isMobile()) return;

    const isHidden = menu.classList.contains("hidden");
    if (isHidden) showMenu();
    else hideMenu();
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".mobile-view-item");
    if (!item) return;

    const v = item.getAttribute("data-view");
    if (!v) return;

    setView(v);
  });

  document.addEventListener("click", (e) => {
    if (menu.classList.contains("hidden")) return;
    if (dd.contains(e.target)) return;
    hideMenu();
  });

  // ✅ critical: when resizing back to desktop, remove inline display locks
  window.addEventListener("resize", () => {
    if (!isMobile()) resetDesktopPanels();
  });

  // default view
  if (isMobile()) setView("left");
  else resetDesktopPanels();
})();
