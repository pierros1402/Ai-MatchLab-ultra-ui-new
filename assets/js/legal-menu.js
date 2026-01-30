
/* =====================================================
   LEGAL MENU (SELF-CONTAINED)
   - Builds internal legal content (Terms / Privacy / etc)
   - Opens as a premium popup
   - No external navigation required
===================================================== */

(() => {
  const MENU_ID = "legal-menu";

  const DEFAULT_DOCS = {
    terms: {
      title: "Terms",
      body: `
        <p><b>AI MatchLab ULTRA</b> provides football analytics and informational content.</p>
        <p>Use at your own risk. No guarantees are made about predictions, odds, or results.</p>
        <p>Bet responsibly. If you are underage or gambling is restricted in your region, do not use betting features.</p>
      `
    },
    privacy: {
      title: "Privacy",
      body: `
        <p>We respect your privacy.</p>
        <p>The app may store non-sensitive preferences locally (theme/language/UI state) to improve usability.</p>
        <p>No personal data is intentionally sold or shared.</p>
      `
    },
    impressum: {
      title: "Impressum",
      body: `
        <p>Project: <b>AI MatchLab ULTRA</b></p>
        <p>Contact: <span class="legal-muted">Add your email / company info here</span></p>
      `
    },
    disclaimer: {
      title: "Disclaimer",
      body: `
        <p>This application is for informational purposes only.</p>
        <p>We do not provide financial advice. Odds and analytics may be inaccurate or delayed.</p>
      `
    },
    cookies: {
      title: "Cookies",
      body: `
        <p>This app may use local storage for UI preferences (theme/accent/language).</p>
        <p>No tracking cookies are required for core functionality.</p>
      `
    }
  };

  const qs = (sel, root = document) => root.querySelector(sel);

  const ensureMenu = () => {
    let menu = document.getElementById(MENU_ID);
    if (!menu) {
      menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.className = "legal-menu hidden";
      menu.setAttribute("aria-hidden", "true");
      document.body.appendChild(menu);
    }
    return menu;
  };

  const buildMenuHTML = () => {
    return `
      <div class="legal-shell">
        <div class="legal-head">
          <div class="legal-title">Legal</div>
          <button class="aiml-legal-close" type="button" aria-label="Close">×</button>
        </div>

        <div class="legal-tabs">
          <button class="legal-tab active" data-doc="terms" type="button">Terms</button>
          <button class="legal-tab" data-doc="privacy" type="button">Privacy</button>
          <button class="legal-tab" data-doc="impressum" type="button">Impressum</button>
          <button class="legal-tab" data-doc="disclaimer" type="button">Disclaimer</button>
          <button class="legal-tab" data-doc="cookies" type="button">Cookies</button>
        </div>

        <div class="legal-body">
          <div class="legal-doc-title"></div>
          <div class="legal-doc-content"></div>
        </div>
      </div>
    `;
  };

  const applyDoc = (menu, key) => {
    const doc = DEFAULT_DOCS[key] || DEFAULT_DOCS.terms;

    const titleEl = qs(".legal-doc-title", menu);
    const contentEl = qs(".legal-doc-content", menu);

    if (titleEl) titleEl.textContent = doc.title;
    if (contentEl) contentEl.innerHTML = doc.body;

    // set active tab
    const tabs = [...menu.querySelectorAll(".legal-tab")];
    tabs.forEach(t => {
      const isActive = t.getAttribute("data-doc") === key;
      t.classList.toggle("active", isActive);
    });
  };

  const openMenu = () => {
    const menu = ensureMenu();
    if (!menu.dataset.built) {
      menu.innerHTML = buildMenuHTML();
      menu.dataset.built = "1";

      // default doc
      applyDoc(menu, "terms");

      // bind close
      const btnClose = qs(".aiml-legal-close", menu);
      if (btnClose) {
        btnClose.addEventListener("click", (e) => {
          e.preventDefault();
          closeMenu();
        });
      }

      // bind tab clicks
      menu.addEventListener("click", (e) => {
        const tab = e.target.closest(".legal-tab");
        if (!tab) return;
        const key = tab.getAttribute("data-doc");
        applyDoc(menu, key);
      });
    }

    menu.classList.remove("hidden");
    menu.setAttribute("aria-hidden", "false");
  };

  const closeMenu = () => {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    menu.classList.add("hidden");
    menu.setAttribute("aria-hidden", "true");
  };

  // expose minimal API
  window.AIML_LEGAL = {
    open: openMenu,
    close: closeMenu
  };

  // bind topbar button (desktop)
  const bindTopbar = () => {
    const btn = document.getElementById("btn-legal");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu();
    });
  };

  // outside click closes only when clicking backdrop area
  document.addEventListener("click", (e) => {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    if (menu.classList.contains("hidden")) return;

    const shell = qs(".legal-shell", menu);
    if (!shell) return;

    // click outside shell closes
    if (!shell.contains(e.target)) {
      closeMenu();
    }
  });

  bindTopbar();
})();
