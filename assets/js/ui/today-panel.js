/* =========================================================
   TODAY PANEL – UNIFIED SOURCE (CLOUDFLARE SAFE) + ACTIONS RESTORED
   - Preserves original:
       * Single fetch
       * PRE + LIVE shown
       * FT removed from Today
       * Emits to Live panel
       * Local date filter (no UTC bug)
       * AIML_FIXTURES_TODAY cache
       * today-matches:loaded emit
       * Auto refresh only when LIVE exists
   - Restores from Active panel:
       * Save (★/☆) with saved sync
       * Details (ⓘ) with nav:matches focus details
   - Keeps:
       * Row click -> match-selected + nav:oic odds
========================================================= */

(function () {

  const BASE =
    (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
      ? window.AIML_CONFIG.BASE_URL
      : "https://aimatchlab-main-worker.pierros1402.workers.dev";

  const panel = document.querySelector("#panel-today .panel-body");
  if (!panel) return;

  let LOADING = false;
  let REFRESH_MS = 60000;
  let timer = null;

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();

  function todayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  function isLiveStatus(st) {
    const s = String(st || "").toUpperCase();
    return (
      s === "LIVE" ||
      s.includes("LIVE") ||
      s.includes("IN_PROGRESS")
    );
  }

  function startOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  function endOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }

  function safeEmit(name, payload) {
    if (typeof window.emit === "function") window.emit(name, payload);
  }

  function syncSaved(items) {
    const s = new Set();
    (Array.isArray(items) ? items : []).forEach(x => {
      if (x && x.id != null) s.add(String(x.id));
    });
    SAVED_IDS = s;
  }

  function isSaved(m) {
    return m && m.id != null && SAVED_IDS.has(String(m.id));
  }

  function render(matches) {
    panel.innerHTML = "";

    LAST_MATCHES = Array.isArray(matches) ? matches : [];

    const startDay = startOfTodayLocalMs();
    const endDay = endOfTodayLocalMs();

    const arr = LAST_MATCHES
      .filter(m => {
        const st = String(m.status || "").toUpperCase();
        return (st.includes("SCHEDULED") || isLiveStatus(st));
      })
      .filter(m => {
        const ko = Number(m.kickoff_ms || 0);
        return ko >= startDay && ko <= endDay;
      })
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
      const st = String(m.status || "").toUpperCase();

      if (isLiveStatus(st)) {
        const min = m.minute ? `${m.minute}'` : "";
        const sc =
          m.scoreHome != null && m.scoreAway != null
            ? `${m.scoreHome}-${m.scoreAway}`
            : "";
        info.textContent = `${min} ${sc}`.trim() || "LIVE";
      } else {
        info.textContent = time;
      }

      // ⭐ Save (same behavior as Active)
      const save = document.createElement("span");
      save.className = "match-save";
      save.textContent = isSaved(m) ? "★" : "☆";
      save.onclick = (e) => {
        e.stopPropagation();
        if (window.emit) emit("save-toggle", m);
      };

      // ⓘ Details (same behavior as Active)
      const details = document.createElement("span");
      details.className = "match-details";
      details.textContent = "ⓘ";
      details.onclick = (e) => {
        e.stopPropagation();
        if (window.emit) {
          emit("details-open", m);
          emit("nav:matches", { focus: "details" });
        }
      };

      right.appendChild(info);
      right.appendChild(save);
      right.appendChild(details);

      row.appendChild(left);
      row.appendChild(right);

      // Row click -> send to OIC odds (same as Active)
      row.onclick = () => {
        if (window.emit) {
          emit("match-selected", m);
          emit("active-match:set", m);
          emit("nav:oic", { tab: "odds" });
                    if (window.AIML_MOBILE_SET_VIEW) {
              window.AIML_MOBILE_SET_VIEW("odds");
            }
}
      };

      panel.appendChild(row);
    });
  }

  async function load() {
    if (LOADING) return;
    LOADING = true;

    try {
      const res = await fetch(`${BASE}/fixtures-runtime?date=${todayISO()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");

      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];

      window.AIML_FIXTURES_TODAY = { matches };

      render(matches);

      safeEmit("live:update", { matches });
      safeEmit("today-matches:loaded", { matches });

      const hasLive = matches.some(m => isLiveStatus(m.status));
      if (hasLive) {
        if (!timer) timer = setInterval(load, REFRESH_MS);
      } else {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }

    } catch (e) {
      panel.innerHTML = "<div class='error'>Σφάλμα φόρτωσης</div>";
      console.error("[TODAY]", e);
    } finally {
      LOADING = false;
    }
  }

  // saved sync hooks (same as Active)
  if (window.on) {
    on("saved:updated", payload => {
      syncSaved(payload?.items || []);
      render(LAST_MATCHES);
    });
  }

  try {
    syncSaved(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}

  load();

})();