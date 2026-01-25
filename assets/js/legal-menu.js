(function () {
  "use strict";

  const BTN_ID = "btn-legal";
  const MENU_ID = "legal-menu";

  function $(id) {
    return document.getElementById(id);
  }

  function isOpen(menuEl) {
    return menuEl && !menuEl.classList.contains("hidden");
  }

  function setOpen(menuEl, v) {
    if (!menuEl) return;
    if (v) {
      menuEl.classList.remove("hidden");
      menuEl.setAttribute("aria-hidden", "false");
    } else {
      menuEl.classList.add("hidden");
      menuEl.setAttribute("aria-hidden", "true");
    }
  }

  function buildLegalMenuHTML() {
    const items = [
      { label: "Terms", href: "/legal/terms.html" },
      { label: "Privacy", href: "/legal/privacy.html" },
      { label: "Impressum", href: "/legal/impressum.html" },
      { label: "Disclaimer", href: "/legal/disclaimer.html" },
      { label: "Cookies", href: "/legal/cookies.html" }
    ];

    const rows = items
      .map(
        (it) => `
          <a class="aiml-legal-item"
             href="${it.href}"
             target="_blank"
             rel="noopener noreferrer">
            ${it.label}
          </a>
        `
      )
      .join("");

    return `
      <div class="aiml-legal-head">
        <div class="aiml-legal-title">Legal</div>
        <button class="aiml-legal-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="aiml-legal-list">
        ${rows}
      </div>
    `;
  }

  function ensureInjected(menuEl) {
    if (!menuEl) return;

    const hasSignature = !!menuEl.querySelector(".aiml-legal-list");
    if (!hasSignature) {
      menuEl.innerHTML = buildLegalMenuHTML();
    }

    // bind close once
    const closeBtn = menuEl.querySelector(".aiml-legal-close");
    if (closeBtn && !closeBtn.__aimlBound) {
      closeBtn.__aimlBound = true;
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); 
        setOpen(menuEl, false);
      });
    }

    // close on item click once
    if (!menuEl.__aimlItemsBound) {
      menuEl.__aimlItemsBound = true;
      menuEl.addEventListener(
        "click",
        (e) => {
          const a = e.target && e.target.closest ? e.target.closest("a") : null;
          if (!a) return;
          setOpen(menuEl, false);
        },
        true
      );
    }
  }

  function positionMenu(btnEl, menuEl) {
    if (!btnEl || !menuEl) return;
    const r = btnEl.getBoundingClientRect();

    const top = Math.round(r.bottom + 14);
    const right = Math.round(window.innerWidth - r.right);

    menuEl.style.position = "fixed";
    menuEl.style.top = `${top}px`;
    menuEl.style.right = `${right}px`;
    menuEl.style.left = "auto";
    menuEl.style.zIndex = "99999";
    menuEl.style.pointerEvents = "auto";
  }

  function openMenu() {
    const btn = $(BTN_ID);
    const menu = $(MENU_ID);
    if (!btn || !menu) return;

    ensureInjected(menu);
    setOpen(menu, true);
    positionMenu(btn, menu);
  }

  function closeMenu() {
    const menu = $(MENU_ID);
    if (!menu) return;
    setOpen(menu, false);
  }

  function toggleMenu() {
    const menu = $(MENU_ID);
    if (!menu) return;
    if (isOpen(menu)) closeMenu();
    else openMenu();
  }

  function onOutsidePointerDown(e) {
    const btn = $(BTN_ID);
    const menu = $(MENU_ID);
    if (!btn || !menu) return;

    const t = e.target;
    if (btn.contains(t)) return;
    if (menu.contains(t)) return;

    if (isOpen(menu)) closeMenu();
  }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;
    const menu = $(MENU_ID);
    if (menu && isOpen(menu)) closeMenu();
  }

  function init() {
    const btn = $(BTN_ID);
    const menu = $(MENU_ID);
    if (!btn || !menu) return;

    setOpen(menu, false);

    btn.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu();
      },
      true
    );

    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);

    console.log("[legal] ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
