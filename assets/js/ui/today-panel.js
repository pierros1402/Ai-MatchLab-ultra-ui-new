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
      : "https://aimatchlab-api.pierros1402.workers.dev";

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
      s.includes("LIVE") ||
      s.includes("IN_PROGRESS") ||
      s.includes("FIRST_HALF") ||
      s.includes("SECOND_HALF") ||
      s.includes("HALF_TIME") ||
      s.includes("EXTRA_TIME")
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

    const now = Date.now();

    const arr = LAST_MATCHES
      .filter(m => {

        const st = String(m.status || "").toUpperCase();
        const ko = Number(m.kickoff_ms || 0);

        const isPre = st.includes("SCHEDULED");
        const isLive = isLiveStatus(st);

        // hide scheduled matches that should have started already
        if (isPre && ko && ko < now) {
          return false;
        }

        return isPre || isLive;

      })
      .filter(m => {
        const ko = Number(m.kickoff_ms || 0);
        return ko >= startDay && ko <= endDay;
      })
      .sort((a, b) => {

        const ka = Number(a.kickoff_ms || 0);
        const kb = Number(b.kickoff_ms || 0);

        if (ka !== kb) return ka - kb;

        const la = (a.leagueSlug || "").toLowerCase();
        const lb = (b.leagueSlug || "").toLowerCase();

        if (la !== lb) return la.localeCompare(lb);

        const ha = (a.home || "").toLowerCase();
        const hb = (b.home || "").toLowerCase();

        return ha.localeCompare(hb);

      });

    if (!arr.length) {
      panel.innerHTML = "<div class='empty'>Δεν υπάρχουν αγώνες σήμερα</div>";
      return;
    }

    let lastTime = null;
    let lastLeague = null;

    arr.forEach(m => {

      const time = fmtTime(m.kickoff_ms);

      if (time !== lastTime) {
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

    // 👇 ΝΕΟ BLOCK ΕΔΩ
      if (window.__AIML_SNAPSHOT?.live?.matches?.length) {

        const matches = window.__AIML_SNAPSHOT.live.matches;

        window.AIML_FIXTURES_TODAY = { matches };

        render(matches);

        safeEmit("today-matches:loaded", { matches });

        safeEmit("active-leagues:updated", { matches });

        LOADING = false;
        return;
      }

    // 👇 παλιό fetch συνεχίζει κανονικά
      const res = await fetch(
        `${BASE}/fixtures-runtime?mode=today&date=${todayISO()}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("fetch failed");

      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];

      window.AIML_FIXTURES_TODAY = { matches };

      render(matches);

      safeEmit("today-matches:loaded", { matches });

// ----------------------------------
// SYNC WITH LIVE SNAPSHOT
// ----------------------------------
      if (!window.__AIML_LAST_LIVE?.matches?.length) {
      safeEmit("active-leagues:updated", { matches });
    }

      const hasLive = matches.some(m => isLiveStatus(m.status));

      if (hasLive) {

        // If live snapshot exists, rely on event updates
        if (window.__AIML_SNAPSHOT?.live?.matches?.length) {

          if (timer) {
            clearInterval(timer);
            timer = null;
          }

        } else {

          if (!timer) timer = setInterval(load, REFRESH_MS);

        }

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