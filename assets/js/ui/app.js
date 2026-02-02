/* =========================================================
   AI MatchLab ULTRA — app.js (CLEAN / LOCKED + ODDS BRIDGE)
   Responsibilities:
   - Global event bus
   - App lifecycle (splash)
   - Mobile title sync
   - ODDS EVENT NORMALIZATION (SAFE)
========================================================= */

(function () {
  'use strict';

  if (window.__AIML_APP_INIT__) return;
  window.__AIML_APP_INIT__ = true;

  // =====================================================
  // EVENT BUS (SINGLE SOURCE OF TRUTH)
  // =====================================================
  const bus = new Map();

  function busOn(eventName, handler) {
    if (!eventName || typeof handler !== 'function') return;
    const arr = bus.get(eventName) || [];
    arr.push(handler);
    bus.set(eventName, arr);
  }

  function busEmit(eventName, payload) {
    const arr = bus.get(eventName);
    if (arr && arr.length) {
      for (const fn of arr) {
        try {
          fn(payload);
        } catch (err) {
          console.error('[BUS] handler failed:', eventName, err);
        }
      }
    }

    // --------------------------------------------------
    // ODDS CANONICAL BRIDGE (AUTO-DETECT)
    // --------------------------------------------------
    // If ANY event emits odds-like rows, normalize them
    // into odds-snapshot:canonical for the UI
    // --------------------------------------------------
    if (
      payload &&
      !eventName.startsWith('odds-snapshot:canonical') &&
      Array.isArray(payload.rows)
    ) {
      const sample = payload.rows[0];

      if (
        sample &&
        (sample.open != null || sample.current != null) &&
        sample.matchId != null
      ) {
        busEmit('odds-snapshot:canonical', {
          ts: Date.now(),
          market: payload.market || sample.market || '1X2',
          rows: payload.rows
        });
      }
    }
  }

  // =====================================================
  // GLOBAL COMPATIBILITY LAYER (DO NOT REMOVE)
  // =====================================================
  window.on = busOn;
  window.emit = busEmit;

  // =====================================================
  // SPLASH HANDLER
  // =====================================================
  function hideSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.remove();
        window.emit('app:ready');
      }, 600);
    }
  }

  window.addEventListener('load', () => {
    setTimeout(hideSplash, 1500);
  });

  // =====================================================
  // MOBILE TITLE SYNC
  // =====================================================
  function syncMobilePanelTitles() {
    const isRightOpen = document.body.classList.contains('drawer-right-open');
    if (!isRightOpen) return;

    const rightHeaderTitle =
      document.querySelector('aside#right-panel > .panel-header .panel-title');
    const visibleCardTitle =
      document.querySelector('aside#right-panel .right-card-header .panel-title');

    if (rightHeaderTitle && visibleCardTitle) {
      rightHeaderTitle.textContent = visibleCardTitle.textContent.trim();
    }
  }

  document.addEventListener('click', syncMobilePanelTitles, true);

  // =====================================================
  // NAVIGATION (MATCHES vs OIC)
  // =====================================================
  function scrollToEl(el) {
    try {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {}
  }

  function isMobileView() {
    // Align with existing UI logic: treat <= 700px as mobile
    try { return window.matchMedia && window.matchMedia('(max-width: 700px)').matches; }
    catch (_) { return false; }
  }

  // Focus Odds Intelligence Center (center) - keep existing desktop/mobile behavior:
  // We only force-scroll on mobile. Desktop stays as-is.
  window.on('nav:oic', function (payload) {
    if (isMobileView()) {
      const oic = document.getElementById('odds-intelligence-center');
      if (oic) scrollToEl(oic);
    }
    // Optional: allow OIC internals to react (tab focus, etc.)
    window.emit('oic:focus', payload || { tab: 'odds' });
  });

  // Focus Matches (details area)
  window.on('nav:matches', function () {
    const matches =
      document.getElementById('panel-matches') ||
      document.getElementById('matches-list') ||
      document.getElementById('matches-panel');
    if (matches) scrollToEl(matches);
    window.emit('matches:focus', { section: 'details' });
  });


  // ⓘ details button -> MUST go to Matches (local-only, no odds/worker)
  window.on('details-open', function (m) {
    if (!m) return;

    // do NOT emit match-selected here (it triggers OIC/odds listeners)
    window.emit('nav:matches', { focus: 'details' });

    try {
      if (window.DetailsPanel && typeof window.DetailsPanel.renderLocal === 'function') {
        const host =
          document.getElementById('matches-list') ||
          document.getElementById('matches-panel');
        if (host) window.DetailsPanel.renderLocal(m, host);
      }
    } catch (err) {
      console.error('[details-open] local render failed', err);
    }
  });

})();