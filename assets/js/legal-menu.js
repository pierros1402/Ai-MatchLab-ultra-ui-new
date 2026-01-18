/* /assets/js/legal-menu.js
   - Capture pointerdown for toggle/outside close ONLY
   - Do NOT close on pointerdown for links (would cancel navigation)
   - Close after click on a link
*/
(function () {
  "use strict";

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
  }

  function toggle(pop, btn) {
    if (!pop) return;
    if (isOpen(pop)) close(pop, btn);
    else open(pop, btn);
  }

  // Toggle / outside close (CAPTURE)
  document.addEventListener("pointerdown", function (e) {
    const btn = document.getElementById("btn-legal");
    const pop = document.getElementById("legal-menu");
    const x = document.getElementById("btn-legal-close");
    if (!btn || !pop) return;

    const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
    const inBtn = (e.target === btn) || btn.contains(e.target) || (path.indexOf(btn) !== -1);
    const inX = x && ((e.target === x) || x.contains(e.target) || (path.indexOf(x) !== -1));
    const inPop = pop.contains(e.target) || (path.indexOf(pop) !== -1);

    if (inX) {
      e.preventDefault();
      e.stopImmediatePropagation();
      close(pop, btn);
      return;
    }

    if (inBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle(pop, btn);
      return;
    }

    // IMPORTANT: do NOT close on pointerdown inside popover (links need click default)
    if (!inPop && isOpen(pop)) close(pop, btn);
  }, true);

  // Close AFTER clicking a link (BUBBLE click)
  document.addEventListener("click", function (e) {
    const pop = document.getElementById("legal-menu");
    const btn = document.getElementById("btn-legal");
    if (!pop || !btn) return;
    if (!isOpen(pop)) return;

    const a = e.target && e.target.closest ? e.target.closest("#legal-menu a") : null;
    if (a) close(pop, btn);
  }, false);

  window.addEventListener("resize", function () {
    const btn = document.getElementById("btn-legal");
    const pop = document.getElementById("legal-menu");
    if (btn && pop && isOpen(pop)) positionPopover(pop, btn);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    const btn = document.getElementById("btn-legal");
    const pop = document.getElementById("legal-menu");
    if (btn && pop && isOpen(pop)) close(pop, btn);
  }, true);

  console.log("[legal] ready");
})();
