/* =========================================================
   PWA INSTALL (ONLINE ONLY - NO SERVICE WORKER)
   File: assets/js/install.js

   Requirements in index.html:
   - <button id="btn-install" class="topbar-btn" title="Install">⬇</button>
   - <link rel="manifest" href="/manifest.webmanifest">
========================================================= */

(function () {
  "use strict";

  let deferredPrompt = null;

  function $(id) {
    return document.getElementById(id);
  }

  function show(btn) {
    if (!btn) return;
    btn.style.display = "inline-flex";
    btn.style.visibility = "visible";
    btn.style.opacity = "1";
    btn.disabled = false;
  }

  function hide(btn) {
    if (!btn) return;
    btn.style.display = "none";
    btn.style.visibility = "hidden";
    btn.style.opacity = "0";
  }

  function isStandalone() {
    // iOS + modern browsers
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function boot() {
    const btnInstall = $("btn-install");
    if (!btnInstall) return;

    // Default hidden always
    hide(btnInstall);

    // If already installed, keep hidden
    if (isStandalone()) {
      hide(btnInstall);
      return;
    }

    // Install click
    btnInstall.addEventListener("click", async () => {
      if (!deferredPrompt) return;

      try {
        deferredPrompt.prompt();

        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;

        // Hide button after attempt (accepted or dismissed)
        hide(btnInstall);

        // Optional log
        console.log("[install] userChoice:", choice && choice.outcome ? choice.outcome : "unknown");
      } catch (e) {
        console.warn("[install] prompt error", e);
        hide(btnInstall);
      }
    });

    // Browser install availability
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      show(btnInstall);
      console.log("[install] beforeinstallprompt captured");
    });

    // After installation
    window.addEventListener("appinstalled", () => {
      console.log("[install] appinstalled");
      deferredPrompt = null;
      hide(btnInstall);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
