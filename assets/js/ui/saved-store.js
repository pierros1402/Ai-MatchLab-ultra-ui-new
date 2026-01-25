/* =========================================================
   saved-store.js — Global saved matches store (FINAL)
   Emits BOTH: saved:updated (canonical) + saved:changed (legacy)
========================================================= */

(function () {
  const KEY = "AIML_SAVED_MATCHES";
  let saved = new Map();

  function load() {
    saved = new Map();
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      raw.forEach(m => {
        if (m && m.id != null) saved.set(String(m.id), m);
      });
    } catch {}
  }

  function items() {
    return Array.from(saved.values());
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(items()));
    } catch {}
  }

  function emitSaved() {
    const arr = items();
    // canonical payload
    window.emit && window.emit("saved:updated", { items: arr });
    // legacy (some older code may listen here)
    window.emit && window.emit("saved:changed", arr);
  }

  load();

  // API for panels
  window.getSavedMatches = () => items();

  // Toggle handler
  window.on && window.on("save-toggle", (m) => {
    if (!m || m.id == null) return;
    const id = String(m.id);

    if (saved.has(id)) saved.delete(id);
    else saved.set(id, m);

    persist();
    emitSaved();
  });

  // Optional: allow external forcing of refresh
  window.on && window.on("saved:refresh", () => {
    load();
    emitSaved();
  });

  // Initial emit so panels can paint immediately if needed
  emitSaved();
})();
