/* /assets/js/theme.js
   - Moves #theme-menu to <body> to avoid topbar overflow clipping
   - Applies html.light for Light mode (per theme.css)
   - Persists mode + accent
   - Syncs .active states inside the menu so the user sees selections
*/
(function () {
  "use strict";

  const STORAGE_MODE = "aiml_theme_mode";
  const STORAGE_ACCENT = "aiml_theme_accent";

  function getSaved() {
    return {
      mode: localStorage.getItem(STORAGE_MODE) || "dark",
      accent: localStorage.getItem(STORAGE_ACCENT) || "default",
    };
  }

  function save(mode, accent) {
    localStorage.setItem(STORAGE_MODE, mode);
    localStorage.setItem(STORAGE_ACCENT, accent);
  }

  function applyTheme(mode, accent) {
    const root = document.documentElement;
    const m = (mode === "light") ? "light" : "dark";
    const a = accent || "default";

    // theme.css expects html.light for Light mode
    root.classList.toggle("light", m === "light");
    root.classList.toggle("dark", m !== "light");
    root.setAttribute("data-accent", a);

    // compatibility (harmless)
    root.setAttribute("data-theme", m);
    if (document.body) {
      document.body.setAttribute("data-theme", m);
      document.body.setAttribute("data-accent", a);
    }

    syncMenuActive();
  }

  function syncMenuActive() {
    const menu = document.getElementById("theme-menu");
    if (!menu) return;

    const { mode, accent } = getSaved();
    const m = (mode === "light") ? "light" : "dark";
    const a = accent || "default";

    // clear
    menu.querySelectorAll(".popover-link.active").forEach(el => el.classList.remove("active"));

    // mode buttons (support both attrs)
    const modeEl =
      menu.querySelector(`[data-theme-mode="${m}"]`) ||
      menu.querySelector(`[data-theme="${m}"]`);
    if (modeEl) modeEl.classList.add("active");

    // accent buttons
    const accentEl = menu.querySelector(`[data-accent="${a}"]`);
    if (accentEl) accentEl.classList.add("active");
  }

  function isOpen(pop) {
    return pop && !pop.classList.contains("hidden") && pop.getAttribute("aria-hidden") !== "true";
  }

  function safeBlurInside(pop) {
    const ae = document.activeElement;
    if (ae && pop && pop.contains(ae) && typeof ae.blur === "function") {
      try { ae.blur(); } catch (_) {}
    }
  }

  function ensureOnBody(pop) {
    if (!pop) return;
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
  }

  function positionPopover(pop, btn) {
    if (!pop || !btn) return;
    const r = btn.getBoundingClientRect();

    pop.style.position = "fixed";
    pop.style.zIndex = "99999";
    pop.style.pointerEvents = "auto";

    pop.style.top = Math.round(r.bottom + 8) + "px";
    pop.style.right = Math.round(window.innerWidth - r.right) + "px";
    pop.style.left = "auto";
  }

  function close(pop, focusBackEl) {
    if (!pop) return;
    safeBlurInside(pop);
    pop.classList.add("hidden");
    pop.setAttribute("aria-hidden", "true");
    if (focusBackEl && typeof focusBackEl.focus === "function") {
      try { focusBackEl.focus({ preventScroll: true }); } catch (_) { try { focusBackEl.focus(); } catch (_) {} }
    }
  }

  function open(pop, btn) {
    if (!pop) return;
    ensureOnBody(pop);
    positionPopover(pop, btn);
    pop.classList.remove("hidden");
    pop.setAttribute("aria-hidden", "false");
    syncMenuActive();
  }

  function toggle(pop, btn) {
    if (!pop) return;
    if (isOpen(pop)) close(pop, btn);
    else open(pop, btn);
  }

  // Apply saved immediately on load
  try {
    const saved = getSaved();
    applyTheme(saved.mode, saved.accent);
  } catch (_) {}

  // CAPTURE pointerdown to avoid other scripts interfering
  document.addEventListener("pointerdown", function (e) {
    const btnTheme = document.getElementById("btn-theme");
    const menu = document.getElementById("theme-menu");
    const btnClose = document.getElementById("btn-theme-close");
    if (!btnTheme || !menu) return;

    const path = (typeof e.composedPath === "function") ? e.composedPath() : [];

    const clickedThemeBtn =
      e.target === btnTheme || btnTheme.contains(e.target) || (path.indexOf(btnTheme) !== -1);

    const clickedClose =
      btnClose && (e.target === btnClose || btnClose.contains(e.target) || (path.indexOf(btnClose) !== -1));

    const clickedInsideMenu =
      menu.contains(e.target) || (path.indexOf(menu) !== -1);

    if (clickedClose) {
      e.preventDefault();
      e.stopImmediatePropagation();
      close(menu, btnTheme);
      return;
    }

    if (clickedThemeBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle(menu, btnTheme);
      return;
    }

    // Inside menu: apply selections
    if (clickedInsideMenu) {
      const el = e.target.closest("[data-theme],[data-theme-mode],[data-accent]");
      if (!el) return;

      let { mode, accent } = getSaved();

      if (el.hasAttribute("data-theme")) {
        const m = el.getAttribute("data-theme");
        if (m === "dark" || m === "light") mode = m;
      } else if (el.hasAttribute("data-theme-mode")) {
        const m = el.getAttribute("data-theme-mode");
        if (m === "dark" || m === "light") mode = m;
      }

      if (el.hasAttribute("data-accent")) {
        accent = el.getAttribute("data-accent") || "default";
      }

      save(mode, accent);
      applyTheme(mode, accent);
      return;
    }

    // Outside closes
    if (isOpen(menu)) close(menu, btnTheme);
  }, true);

  window.addEventListener("resize", function () {
    const btnTheme = document.getElementById("btn-theme");
    const menu = document.getElementById("theme-menu");
    if (btnTheme && menu && isOpen(menu)) positionPopover(menu, btnTheme);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    const btnTheme = document.getElementById("btn-theme");
    const menu = document.getElementById("theme-menu");
    if (btnTheme && menu && isOpen(menu)) close(menu, btnTheme);
  }, true);

  console.log("[theme] ready");
})();
