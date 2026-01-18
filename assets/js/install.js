/* ============================================================
   AI MatchLab ULTRA — install.js (GLOBAL, NO MODULES)
   - PWA install prompt handling
   - Shows button only when installable
============================================================ */

(function () {
  "use strict";
  if (window.__AIML_INSTALL__) return;
  window.__AIML_INSTALL__ = true;

  const btn = document.getElementById("btn-install");
  let deferredPrompt = null;

  function hide() { if (btn) btn.style.display = "none"; }
  function show() { if (btn) btn.style.display = ""; }

  // Default: hide until we know it’s installable
  if (btn) hide();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hide();
  });

  btn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    hide();
  });
})();
