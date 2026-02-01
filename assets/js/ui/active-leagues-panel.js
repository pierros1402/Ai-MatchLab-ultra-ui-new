/* =========================================================
   ACTIVE LEAGUES TODAY – FIXED (Details -> open like Matches)
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const LIST_ID = "active-leagues-list";
  const TZ = "Europe/Athens";

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set();

  function pad2(n) { return String(n).padStart(2, "0"); }

  function timeHHMM(ms) {
    try {
      return new Intl.DateTimeFormat("el-GR", {
        timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
  }

  function isPRE(m) {
    const s = String(m?.status || "").toUpperCase();
    return s === "PRE" || s === "STATUS_SCHEDULED";
  }

  function isFT(m) {
    const s = String(m?.status || "").toUpperCase();
    return s === "FT" || s === "STATUS_FULL_TIME";
  }


  function leagueName(m) { return m.leagueName || m.leagueSlug || "—"; }

  // ✅ NEW: local day window helpers (00:00–23:59 local)
  function startOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  }

  function endOfTodayLocalMs() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
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

  function openMatch(m) {
    // ✅ guaranteed working flow
    emit("match-selected", m);
    emit("active-match:set", m);
  }

  function render(matches) {
    const root = document.getElementById(LIST_ID);
    if (!root) return;

    LAST_MATCHES = Array.isArray(matches) ? matches : [];
    root.innerHTML = "";

    const startDay = startOfTodayLocalMs();
    const endDay = endOfTodayLocalMs();

    // ACTIVE rules:
  // - PRE + FT only
    // - Only matches of today (00:00–23:59 local)
    const arr = LAST_MATCHES.filter(m => {
      if (!(isPRE(m) || isFT(m))) return false;
      const ko = Number(m.kickoff_ms || 0);
      return ko >= startDay && ko <= endDay;
    });

    if (!arr.length) {
      root.innerHTML = "<div class='empty'>No active leagues</div>";
      return;
    }

    const byLeague = {};
    arr.forEach(m => {
      const lg = leagueName(m);
      (byLeague[lg] ||= []).push(m);
    });

    Object.keys(byLeague).forEach(lg => {
      const title = document.createElement("div");
      title.className = "today-league";
      title.textContent = lg;
      root.appendChild(title);

      byLeague[lg].forEach(m => {
        const row = document.createElement("div");
        row.className = "match-row";

        const left = document.createElement("div");
        left.className = "today-match";
        left.textContent = `${m.home} – ${m.away}`;

        const right = document.createElement("div");
        right.className = "today-right";

        const info = document.createElement("span");
        info.textContent = isFT(m)
          ? `${m.scoreHome ?? ""}-${m.scoreAway ?? ""}`
          : timeHHMM(m.kickoff_ms);

        const save = document.createElement("span");
        save.className = "match-save";
        save.textContent = isSaved(m) ? "★" : "☆";
        save.onclick = e => {
          e.stopPropagation();
          emit("save-toggle", m);
        };

        const details = document.createElement("span");
        details.className = "match-details";
        details.textContent = "ⓘ";
        details.onclick = e => {
          e.stopPropagation();
          emit("details-open", m);
        };

        right.appendChild(info);
        right.appendChild(save);
        right.appendChild(details);

        row.appendChild(left);
        row.appendChild(right);

        row.onclick = () => openMatch(m);

        root.appendChild(row);
      });
    });
  }

  on("today-matches:loaded", payload => {
    render(payload && payload.matches ? payload.matches : []);
  });

  on("saved:updated", payload => {
    syncSavedSet(payload && Array.isArray(payload.items) ? payload.items : []);
    if (LAST_MATCHES.length) render(LAST_MATCHES);
  });

  on("saved:changed", arr => {
    syncSavedSet(Array.isArray(arr) ? arr : []);
    if (LAST_MATCHES.length) render(LAST_MATCHES);
  });

  try {
    syncSavedSet(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}
})();
