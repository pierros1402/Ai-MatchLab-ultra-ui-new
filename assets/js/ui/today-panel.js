/* =========================================================
   TODAY PANEL – FINAL, SAFE, WORKING — LOCKED (NO AUTO-REFRESH)
========================================================= */

(function () {
  const BASE = "https://aimatchlab-main-worker.pierros1402.workers.dev";
  const panel = document.querySelector("#panel-today .panel-body");
  if (!panel) return;

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();
  let LOADING = false;

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function safeEmit(name, payload) {
    if (typeof window.emit === "function") window.emit(name, payload);
  }

  function syncSavedSet(items) {
    const set = new Set();
    (Array.isArray(items) ? items : []).forEach(x => {
      if (x && x.id != null) set.add(String(x.id));
    });
    SAVED_IDS = set;
  }

  function isSaved(m) {
    if (!m || m.id == null) return false;
    return SAVED_IDS.has(String(m.id));
  }

  function render(matches) {
    panel.innerHTML = "";

    LAST_MATCHES = Array.isArray(matches) ? matches : [];

    if (!LAST_MATCHES.length) {
      panel.innerHTML = "<div class='empty'>Δεν υπάρχουν αγώνες σήμερα</div>";
      return;
    }

    // TODAY: χωρίς FT
    const arr = LAST_MATCHES
      .filter(m => String(m.status).toUpperCase() !== "FT")
      .slice()
      .sort((a, b) => (a.kickoff_ms || 0) - (b.kickoff_ms || 0));

    if (!arr.length) {
      panel.innerHTML = "<div class='empty'>Δεν υπάρχουν αγώνες σήμερα</div>";
      return;
    }

    let lastTime = null;
    let lastLeague = null;

    arr.forEach(m => {
      const time = fmtTime(m.kickoff_ms);

      if (time !== lastTime) {
        lastLeague = null;
        lastTime = time;
      }

      const lgName = m.leagueName || m.leagueSlug || "—";
      if (lgName !== lastLeague) {
        const lg = document.createElement("div");
        lg.className = "today-league";
        lg.textContent = lgName;
        panel.appendChild(lg);
        lastLeague = lgName;
      }

      const row = document.createElement("div");
      row.className = "match-row";

      const left = document.createElement("div");
      left.className = "today-match";
      left.textContent = `${m.home} – ${m.away}`;

      const right = document.createElement("div");
      right.className = "today-right";

      const info = document.createElement("span");
      const st = String(m.status).toUpperCase();

      if (st === "LIVE") {
        const min = m.minute ? `${m.minute}'` : "";
        const sc =
          m.scoreHome != null && m.scoreAway != null
            ? `${m.scoreHome}-${m.scoreAway}`
            : "";
        info.textContent = `${min} ${sc}`.trim();
      } else {
        info.textContent = time; // PRE: ώρα δεξιά
      }

      const save = document.createElement("span");
      save.className = "match-save";
      save.textContent = isSaved(m) ? "★" : "☆";
      save.onclick = e => {
        e.stopPropagation();
        safeEmit("save-toggle", m);
        // no local flip; repaint comes from saved:updated
      };

      const details = document.createElement("span");
      details.className = "match-details";
      details.textContent = "ⓘ";
      details.onclick = e => {
        e.stopPropagation();
        safeEmit("details-open", { match: m });
      };

      right.appendChild(info);
      right.appendChild(save);
      right.appendChild(details);

      row.appendChild(left);
      row.appendChild(right);

      row.onclick = () => {
        safeEmit("match-selected", m);
        safeEmit("active-match:set", m);
      };

      panel.appendChild(row);
    });
  }

  async function load() {
    if (LOADING) return;
    LOADING = true;

    try {
      panel.innerHTML = "Φόρτωση…";
      const res = await fetch(`${BASE}/fixtures?date=${todayISO()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");

      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];

      render(matches);
      safeEmit("today-matches:loaded", { source: "fixtures", matches });
    } catch (e) {
      panel.innerHTML = "<div class='error'>Σφάλμα φόρτωσης</div>";
      console.error("[TODAY]", e);
    } finally {
      LOADING = false;
    }
  }

  // sync saved
  if (window.on) {
    window.on("saved:updated", payload => {
      syncSavedSet(payload && Array.isArray(payload.items) ? payload.items : []);
      if (LAST_MATCHES.length) render(LAST_MATCHES);
    });
    window.on("saved:changed", arr => {
      syncSavedSet(Array.isArray(arr) ? arr : []);
      if (LAST_MATCHES.length) render(LAST_MATCHES);
    });
  }

  // initial snapshot
  try {
    syncSavedSet(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}

  // ✅ LOAD ONCE (NO AUTO-REFRESH)
  load();
})();
