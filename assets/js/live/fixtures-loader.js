/* =========================================================
   AIML – FIXTURES LOADER (FINAL)
   Role:
   - Fetch fixtures from worker (/fixtures)
   - Emit today-matches:loaded to UI
   - NO demo logic
   - NO backend logic
========================================================= */

(function () {
  if (typeof window.emit !== "function") {
    console.warn("[fixtures-loader] event bus not ready");
    return;
  }

  const cfg = window.AIML_LIVE_CFG || {};
  const base = cfg.fixturesBase;
  const path = cfg.fixturesPath || "/fixtures";
  const scope = cfg.fixturesScope || "all";

  if (!base) {
    window.emit("today-matches:loaded", {
      source: "fixtures",
      matches: []
    });
    return;
  }

  let busy = false;

  async function loadFixtures() {
    if (busy) return;
    busy = true;

    try {
      const tz = "Europe/Athens"; // FORCE GR timezone (UI expects this)
      const url =
        base +
        path +
        `?scope=${encodeURIComponent(scope)}` +
        `&tz=${encodeURIComponent(tz)}` +
        `&_t=${Date.now()}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("fixtures fetch failed");

      const data = await res.json();
      const payload = {
        source: "fixtures",
        matches: Array.isArray(data.matches) ? data.matches : []
      };

      // expose last snapshot (debug / resync)
      window.__AIML_LAST_TODAY__ = payload;

      // emit AFTER UI panels are ready
      setTimeout(() => {
        window.emit("today-matches:loaded", payload);
      }, 0);
    } catch (err) {
      console.warn("[fixtures-loader] error", err);

      const payload = {
        source: "fixtures",
        matches: []
      };
      console.log("[FIXTURES] emitting today-matches", payload);
      window.emit("today-matches:loaded", payload);
      window.__AIML_LAST_TODAY__ = payload;

      setTimeout(() => {
        window.emit("today-matches:loaded", payload);
      }, 0);
    } finally {
      busy = false;
    }
  }

  // initial load
  loadFixtures();

  // optional resync hook (used by live-engine or manual refresh)
  window.on("fixtures:resync", () => {
    if (window.__AIML_LAST_TODAY__) {
      window.emit("today-matches:loaded", window.__AIML_LAST_TODAY__);
    } else {
      loadFixtures();
    }
  });
})();
