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
  // GLOBAL FETCH RESILIENCE LAYER (HARDENED)
  // =====================================================

  if (!window.__AIML_FETCH_PATCHED__) {
    window.__AIML_FETCH_PATCHED__ = true;

    const originalFetch = window.fetch;

    async function fetchWithRetry(resource, options = {}, retries = 3) {
      const delay = 400;

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);


          const mergedOptions = { ...options };

          if (!mergedOptions.signal) {
            mergedOptions.signal = controller.signal;
          }

          const response = await originalFetch(resource, mergedOptions);
          clearTimeout(timeout);

          if (!response.ok) {
            if (response.status >= 500) {
              throw new Error('Server ' + response.status);
            }
            return response;
          }

          return response;

        } catch (err) {
          if (attempt === retries - 1) {
            console.error('[FETCH FAILED]', resource, err);
            throw err;
          }

          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    window.fetch = fetchWithRetry;
  }

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

  window.on = busOn;
  window.emit = busEmit;

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

  function scrollToEl(el) {
    try {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (_) {}
  }

  function isMobileView() {
    try { return window.matchMedia && window.matchMedia('(max-width: 700px)').matches; }
    catch (_) { return false; }
  }

  window.on('nav:oic', function (payload) {
    if (isMobileView()) {
      const oic = document.getElementById('odds-intelligence-center');
      if (oic) scrollToEl(oic);
    }
    window.emit('oic:focus', payload || { tab: 'odds' });
  });

  window.on('nav:matches', function () {
    const matches =
      document.getElementById('panel-matches') ||
      document.getElementById('matches-list') ||
      document.getElementById('matches-panel');
    if (matches) scrollToEl(matches);
    window.emit('matches:focus', { section: 'details' });
  });

  window.on('details-open', function (m) {
    if (!m) return;

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
// =====================================================
// INITIAL DATA BOOTSTRAP (TODAY / ACTIVE / LIVE)
// =====================================================
window.on('app:ready', function () {
  try {
    if (!window.AIML_FixturesLoader) return;

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const ymd = `${y}-${m}-${d}`;

    window.AIML_FixturesLoader.loadToday(ymd);
    window.AIML_FixturesLoader.loadActive(ymd);
    window.AIML_FixturesLoader.loadLive();

  } catch (err) {
    console.error('[APP BOOTSTRAP FAILED]', err);
  }
});
// =====================================================
// SAFETY BOOTSTRAP (independent of splash lifecycle)
// =====================================================
window.addEventListener("DOMContentLoaded", function () {
  setTimeout(function () {
    window.emit("app:ready");
  }, 100);
});
// ============================================================
// TODAY RELOAD HOOK (used by league watcher)
// ============================================================
window.reloadTodayPanel = function () {
  try {
    if (!window.AIML_FixturesLoader) return;

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const ymd = `${y}-${m}-${d}`;

    // refresh ONLY today fixtures (safe)
    window.AIML_FixturesLoader.loadToday(ymd);
  } catch (err) {
    console.error("[reloadTodayPanel] failed", err);
  }
};
// ============================================================
// AI LEAGUE VERSION WATCHER (refresh Today on change)
// ============================================================
const AI_ENGINE_BASE = "https://aimatchlab-ai-engine.pierros1402.workers.dev";

// TODO: αργότερα το κάνουμε dynamic από UI selection
const WATCH_LEAGUE = "eng.1";
const WATCH_SEASON = "2025-2026";

let __leagueVersionCache = null;

async function __checkLeagueState() {
  try {
    const res = await fetch(
      `${AI_ENGINE_BASE}/ai/league-state?league=${encodeURIComponent(WATCH_LEAGUE)}&season=${encodeURIComponent(WATCH_SEASON)}`
    );

    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.ok) return;

    // first sync
    if (__leagueVersionCache === null) {
      __leagueVersionCache = data.leagueVersion ?? 0;
      return;
    }

    // change detected
    const lv = data.leagueVersion ?? 0;
    if (lv !== __leagueVersionCache) {
      console.log("[AI] League update detected:", __leagueVersionCache, "→", lv);
      __leagueVersionCache = lv;

      if (typeof window.reloadTodayPanel === "function") {
        window.reloadTodayPanel();
      }
    }
  } catch (e) {
    console.log("[AI] league watcher error", e);
  }
}

// start after app ready (avoid early noise)
window.on("app:ready", function () {
  __checkLeagueState();                 // immediate sync
  setInterval(__checkLeagueState, 60000); // every 60s
});
})();