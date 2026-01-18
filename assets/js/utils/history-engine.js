/* =========================================================
   AI MatchLab ULTRA — Local History Engine v1.5 (Safe Retention)
   ---------------------------------------------------------------
   - Captures all global events (on/emit & onBus/emitBus)
   - Stores daily snapshots under AIML_HISTORY_V1:YYYY-MM-DD:<type>
   - Dynamic retention by snapshot type
   - Auto-cleanup + size guard (prevents localStorage overflow)
   - Fallback to sessionStorage if quota exceeded
   - Zero edits required elsewhere
========================================================= */

(function () {
  "use strict";
  if (window.__AIML_HISTORY_ENGINE_INIT__) return;
  window.__AIML_HISTORY_ENGINE_INIT__ = true;

  const PREFIX = "AIML_HISTORY_V1:";
  const MAX_DAYS_DEFAULT = 7;
  const DEBUG = false;

  // retention by type (in days)
  const RETENTION = {
    today: 7,
    "odds:canonical": 7,
    "odds:selected": 3,
    "radar:moves": 3,
    value: 3,
    live: 1,
    saved: 1
  };

  // fallback in case localStorage quota exceeded
  let useSessionFallback = false;

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function key(day, type) {
    return `${PREFIX}${day}:${type}`;
  }

  function getStorage() {
    try {
      if (useSessionFallback) return sessionStorage;
      // test write
      const tkey = "__AIML_TEST__";
      localStorage.setItem(tkey, "1");
      localStorage.removeItem(tkey);
      return localStorage;
    } catch {
      useSessionFallback = true;
      return sessionStorage;
    }
  }

  function safeSetItem(k, v) {
    const store = getStorage();
    try {
      store.setItem(k, v);
      return true;
    } catch (err) {
      console.warn("[HISTORY] localStorage full, switching to sessionStorage");
      useSessionFallback = true;
      try {
        sessionStorage.setItem(k, v);
      } catch (_) {}
      return false;
    }
  }

  function saveSnapshot(type, payload) {
    if (!type) return;
    try {
      const day = todayKey();
      const store = getStorage();
      const rec = { type, day, ts: Date.now(), payload };
      safeSetItem(key(day, type), JSON.stringify(rec));
      cleanup(type);
      if (DEBUG) {
        const items =
          Array.isArray(payload?.matches)
            ? payload.matches.length
            : Array.isArray(payload?.values)
            ? payload.values.length
            : Array.isArray(payload?.moves)
            ? payload.moves.length
            : "?";
        console.log(`[HISTORY] saved ${type} (${day}) · items=${items}`);
      }
    } catch (err) {
      console.warn("[HISTORY] save failed", type, err);
    }
  }

  function loadSnapshot(day, type) {
    try {
      const raw = getStorage().getItem(key(day, type));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function listDays() {
    const store = getStorage();
    const days = new Set();
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) days.add(k.split(":")[1]);
    }
    return Array.from(days).sort((a, b) => (a < b ? 1 : -1));
  }

  function cleanup(typeHint) {
    const store = getStorage();
    const now = new Date(todayKey());
    const keepDefault = MAX_DAYS_DEFAULT;

    const keysToRemove = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const parts = k.split(":");
      if (parts.length < 3) continue;
      const day = parts[1];
      const t = parts.slice(2).join(":");
      const maxDays = RETENTION[t] || keepDefault;

      const diffDays =
        (now - new Date(day)) / (1000 * 60 * 60 * 24);

      if (diffDays > maxDays) keysToRemove.push(k);
    }

    keysToRemove.forEach((k) => store.removeItem(k));

    // lightweight overflow guard
    try {
      if (store.length > 300) {
        const all = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && k.startsWith(PREFIX)) {
            const rec = JSON.parse(store.getItem(k) || "{}");
            all.push({ k, ts: rec.ts || 0 });
          }
        }
        all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const excess = all.slice(0, Math.max(0, all.length - 250));
        excess.forEach((e) => store.removeItem(e.k));
        console.warn(
          `[HISTORY] storage trimmed (${excess.length} old snapshots removed)`
        );
      }
    } catch (err) {
      console.warn("[HISTORY] cleanup failed", err);
    }
  }

  // =========================================================
  //  LISTEN TO BOTH EVENT SYSTEMS (on/emit & onBus/emitBus)
  // =========================================================

  function listenAll(event, fn) {
    try {
      if (typeof window.on === "function") window.on(event, fn);
      if (typeof window.onBus === "function") window.onBus(event, fn);
      document.addEventListener(event, (e) => fn(e.detail));
    } catch (err) {
      console.warn("[HISTORY] listener failed", event, err);
    }
  }

  // core event bindings
  listenAll("today-matches:loaded", (p) => p && saveSnapshot("today", p));
  listenAll("value:update", (p) => p && saveSnapshot("value", p));
  listenAll("odds-snapshot:canonical", (p) => p && saveSnapshot("odds:canonical", p));
  listenAll("odds-snapshot", (p) => p && saveSnapshot("odds:selected", p));
  listenAll("radar-moves:update", (p) => p && saveSnapshot("radar:moves", p));
  listenAll("live:update", (p) => p && saveSnapshot("live", p));
  listenAll("saved-store:updated", (p) => saveSnapshot("saved", p || { ts: Date.now() }));

  // expose public API
  window.AIMLHistory = {
    todayKey,
    saveSnapshot,
    loadSnapshot,
    listDays,
    cleanup,
    getStorage
  };

  console.log("[HISTORY] Engine ready v1.5 (safe retention, dynamic cleanup)");
})();
