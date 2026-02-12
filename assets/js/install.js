/* =========================================================
   PWA INSTALL (ONLINE ONLY - NO SERVICE WORKER)
   File: assets/js/install.js

   Requirements in index.html:
   - <button id="btn-install" class="topbar-btn" title="Install">⬇</button>
   - <link rel="manifest" href="/manifest.webmanifest">

   Notes:
   - Chrome/Edge (desktop & Android): uses beforeinstallprompt.
   - iOS Safari: no beforeinstallprompt; shows guidance.
========================================================= */

(function () {
  "use strict";

  // Global debug flag (easy check from console)
  window.__AIML_INSTALL = window.__AIML_INSTALL || {};
  window.__AIML_INSTALL.loadedAt = Date.now();

  let deferredPrompt = null;

  function $(id) { return document.getElementById(id); }

  function log(...args) {
    // Keep logs compact but useful
    // console.log("[install]", ...args);
  }

  function warn(...args) {
    // console.warn("[install]", ...args);
  }

  function show(btn) {
    if (!btn) return;
    btn.style.display = "inline-flex";
    btn.style.visibility = "visible";
    btn.style.opacity = "1";
    btn.disabled = false;
    btn.setAttribute("aria-hidden", "false");
  }

  function hide(btn) {
    if (!btn) return;
    btn.style.display = "none";
    btn.style.visibility = "hidden";
    btn.style.opacity = "0";
    btn.disabled = true;
    btn.setAttribute("aria-hidden", "true");
  }

  function isStandalone() {
    // iOS + modern browsers
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  }

  async function checkManifestReachable() {
    // Best-effort check: read manifest link and fetch it
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !link.href) return { ok: false, reason: "missing_manifest_link" };

    try {
      const res = await fetch(link.href, { cache: "no-store" });
      if (!res.ok) return { ok: false, reason: "manifest_http_" + res.status, href: link.href };
      const txt = await res.text();
      return { ok: true, href: link.href, size: txt.length };
    } catch (e) {
      return { ok: false, reason: "manifest_fetch_error", href: link.href, error: String(e) };
    }
  }

  function boot() {
    const btnInstall = $("btn-install");
    window.__AIML_INSTALL.btnFound = !!btnInstall;

    if (!btnInstall) {
      warn("btn-install not found");
      return;
    }

    // Always start hidden; we will decide to show based on eligibility.
    hide(btnInstall);

    // If already installed, keep hidden.
    if (isStandalone()) {
      log("standalone mode -> hide install");
      hide(btnInstall);
      return;
    }

    // Click handler
    btnInstall.addEventListener("click", async () => {
      // iOS fallback: show guidance
      if (isIOS() && !deferredPrompt) {
        alert("iOS: Install via Share → Add to Home Screen.");
        return;
      }

      if (!deferredPrompt) {
        // Not eligible yet
        warn("clicked but no deferredPrompt (not installable yet or prompt not fired)");
        return;
      }

      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        window.__AIML_INSTALL.lastChoice = choice && choice.outcome ? choice.outcome : "unknown";
        log("userChoice:", window.__AIML_INSTALL.lastChoice);

        deferredPrompt = null;
        hide(btnInstall);
      } catch (e) {
        warn("prompt error", e);
        deferredPrompt = null;
        hide(btnInstall);
      }
    });

    // Capture Chrome/Edge install prompt
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      window.__AIML_INSTALL.beforeinstallpromptAt = Date.now();
      log("beforeinstallprompt captured");
      show(btnInstall);
    });

    // After installation
    window.addEventListener("appinstalled", () => {
      log("appinstalled");
      deferredPrompt = null;
      hide(btnInstall);
    });

    // iOS: show the button as a "help" button (optional)
    if (isIOS()) {
      // We show it so user has a path to install
      show(btnInstall);
      log("iOS detected -> install button acts as guidance");
    }

    // Best-effort diagnostics (does not block UI)
    checkManifestReachable().then((r) => {
      window.__AIML_INSTALL.manifest = r;
      if (!r.ok) warn("manifest issue:", r);
      else log("manifest ok:", { href: r.href, size: r.size });
    });

    // Final: expose current state for console
    window.__AIML_INSTALL.getState = () => ({
      deferredPrompt: !!deferredPrompt,
      standalone: isStandalone(),
      ios: isIOS(),
      manifest: window.__AIML_INSTALL.manifest || null,
      btn: {
        display: btnInstall.style.display,
        visibility: btnInstall.style.visibility,
        opacity: btnInstall.style.opacity,
        disabled: btnInstall.disabled
      }
    });

    log("boot ok");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
