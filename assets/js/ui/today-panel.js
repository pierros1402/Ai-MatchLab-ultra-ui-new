/* =========================================================
   TODAY PANEL – SAFE + LIVE REFRESH (NO SPAM)
========================================================= */

(function () {

  const BASE =
    (window.AIML_CONFIG && window.AIML_CONFIG.BASE_URL)
      ? window.AIML_CONFIG.BASE_URL
      : "https://aiml-serve.pierros1402.workers.dev";

  const panel = document.querySelector("#panel-today .panel-body");
  if (!panel) return;

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();
  let LOADING = false;

  let REFRESH_MS = 60000;
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

  function startOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  function endOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  }

  function isFTWithinGrace(m, graceMs) {
    if (!m) return false;

    const ts =
      Number(m.endedAt || 0) ||
      Number(m.finishedAt || 0) ||
      Number(m.updatedAt || 0) ||
      Number(m.lastUpdate || 0) ||
      Number(m.__ftTs || 0);

    if (!ts) return false;

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

    const now = Date.now();

    return arr.some(m => {
      const st = String(m.status || "").toUpperCase();

      if (st === "LIVE") return true;
      if (st === "FT") return true;

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

    const startDay = startOfTodayLocalMs();
    const endDay = endOfTodayLocalMs();
    const FT_GRACE_MS = 10 * 60 * 1000;

    const arr = LAST_MATCHES
      .filter(m => {
        const st = String(m.status || "").toUpperCase();
        if (st === "FT") return isFTWithinGrace(m, FT_GRACE_MS);
        return true;
      })
      .filter(m => {
        const st = String(m.status || "").toUpperCase();
        if (st === "LIVE") return true;
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
        safeEmit("details-open", m);
        safeEmit("nav:matches", { focus: "details" });
      };

      right.appendChild(info);
      right.appendChild(save);
      right.appendChild(details);

      row.appendChild(left);
      row.appendChild(right);

      row.onclick = () => {
        safeEmit("match-selected", m);
        safeEmit("active-match:set", m);
        safeEmit("nav:oic", { tab: "odds" });
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
      safeEmit("today-matches:loaded", { source: "fixtures", matches });

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

  load();

})();