/* =========================================================
   TODAY PANEL – SAFE + LIVE REFRESH (NO SPAM)
========================================================= */

(function () {
  const BASE = "https://aimatchlab-main-worker.pierros1402.workers.dev";
  const panel = document.querySelector("#panel-today .panel-body");
  if (!panel) return;

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();
  let LOADING = false;

  let REFRESH_MS = 60000; // ✅ 60s safe refresh
  let timer = null;

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

  // ✅ NEW: local day window helpers (00:00–23:59 local)
  function startOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  function endOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }


  // ✅ NEW: FT grace window (keep FT only for X minutes)
  function isFTWithinGrace(m, graceMs) {
    if (!m) return false;

    // priority: server timestamps if they exist
    const ts =
      Number(m.endedAt || 0) ||
      Number(m.finishedAt || 0) ||
      Number(m.updatedAt || 0) ||
      Number(m.lastUpdate || 0) ||
      Number(m.__ftTs || 0);

    // if we don't know when it ended, keep it temporarily
    if (!ts) return true;

    return (Date.now() - ts) <= graceMs;
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

  function shouldKeepRefreshing(matches) {
    const arr = Array.isArray(matches) ? matches : [];
    if (!arr.length) return false;

    // refresh if any match is LIVE or about to start
    const now = Date.now();

    return arr.some(m => {
      const st = String(m.status || "").toUpperCase();

      if (st === "LIVE") return true;

      if (st === "FT") return true; // ✅ keep refreshing so FT can disappear after 10'

      // refresh around kickoffs: within 2 hours window
      const ko = Number(m.kickoff_ms || 0);
      if (!ko) return false;

      const diff = Math.abs(ko - now);
      return diff <= 2 * 60 * 60 * 1000;
    });
  }

  function render(matches) {
    panel.innerHTML = "";

    LAST_MATCHES = Array.isArray(matches) ? matches : [];

    if (!LAST_MATCHES.length) {
      panel.innerHTML = "<div class='empty'>Δεν υπάρχουν αγώνες σήμερα</div>";
      return;
    }

    // ✅ day window for "today only"
    const startDay = startOfTodayLocalMs();
    const endDay = endOfTodayLocalMs();
    // TODAY rules:
    // - FT only for 10 minutes
    // - Only matches of today (00:00–23:59 local)
    // - EXCEPTION: if match is LIVE, keep it even if it started previous day (2-day LIVE)

    const FT_GRACE_MS = 10 * 60 * 1000; // ✅ 10 minutes

    const arr = LAST_MATCHES
      .filter(m => {
        const st = String(m.status || "").toUpperCase();

        // ✅ keep FT only for 10 minutes
        if (st === "FT") return isFTWithinGrace(m, FT_GRACE_MS);

        return true;
      })
      .filter(m => {
        const st = String(m.status || "").toUpperCase();
        if (st === "LIVE") return true; // ✅ keep LIVE always
        const ko = Number(m.kickoff_ms || 0);
        return ko >= startDay && ko <= endDay;
      })
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
        info.textContent = `${min} ${sc}`.trim() || "LIVE";

      } else if (st === "FT") {
        const sc =
          m.scoreHome != null && m.scoreAway != null
            ? `${m.scoreHome}-${m.scoreAway}`
            : "FT";
        info.textContent = sc;

      } else {
        info.textContent = time;
      }

      const save = document.createElement("span");
      save.className = "match-save";
      save.textContent = isSaved(m) ? "★" : "☆";
      save.onclick = e => {
        e.stopPropagation();
        safeEmit("save-toggle", m);
      };

      const details = document.createElement("span");
      details.className = "match-details";
      details.textContent = "ⓘ";
      details.onclick = e => {
        e.stopPropagation();
        safeEmit("match-selected", m);
        safeEmit("active-match:set", m);
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
      const res = await fetch(`${BASE}/fixtures?date=${todayISO()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");

      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];

      // ✅ make fixtures available globally for Live panel league fallback
      window.AIML_FIXTURES_TODAY = { matches };

      render(matches);
      safeEmit("today-matches:loaded", { source: "fixtures", matches });

      // ✅ refresh only when needed
      if (shouldKeepRefreshing(matches)) {
        if (!timer) {
          timer = setInterval(load, REFRESH_MS);
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

  // ✅ LIVE overlay from live-engine (sticky to avoid flicker)
  const LIVE_STICKY_MS = 90000; // 90s

  if (window.on) {
    window.on("live:update", payload => {
      const live = (payload && Array.isArray(payload.matches)) ? payload.matches : [];
      if (!LAST_MATCHES.length) return;

      const now = Date.now();
      const liveMap = new Map(live.map(m => [String(m.id), m]));

      LAST_MATCHES = LAST_MATCHES.map(m => {
        const id = String(m.id);

        // if we got live data for this match -> mark live + timestamp
        const lm = liveMap.get(id);
        if (lm) {
          return {
            ...m,
            status: "LIVE",
            minute: lm.minute ?? m.minute,
            scoreHome: lm.scoreHome ?? lm.homeScore ?? m.scoreHome,
            scoreAway: lm.scoreAway ?? lm.awayScore ?? m.scoreAway,
            __liveTs: now
          };
        }

        // ✅ sticky: if it was live recently, keep it live
        if (m.status === "LIVE" && m.__liveTs && (now - m.__liveTs) < LIVE_STICKY_MS) {
          return m;
        }

        // otherwise keep original fixture state (PRE)
        return m;
      });

      render(LAST_MATCHES);
    });
  }

  load();
})();
