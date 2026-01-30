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
})();
