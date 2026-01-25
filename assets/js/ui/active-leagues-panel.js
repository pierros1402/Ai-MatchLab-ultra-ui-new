/* =========================================================
   ACTIVE LEAGUES TODAY – FINAL (SAVE + DETAILS) — LOCKED
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const LIST_ID = "active-leagues-list";
  const TZ = "Europe/Athens";

  let LAST_MATCHES = [];
  let SAVED_IDS = new Set(); // local snapshot for fast + stable isSaved

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

  function isPRE(m) { return String(m.status).toUpperCase() === "PRE"; }
  function isFT(m)  { return String(m.status).toUpperCase() === "FT"; }

  function leagueName(m) { return m.leagueName || m.leagueSlug || "—"; }

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
    const root = document.getElementById(LIST_ID);
    if (!root) return;

    LAST_MATCHES = Array.isArray(matches) ? matches : [];
    root.innerHTML = "";

    const arr = LAST_MATCHES.filter(m => isPRE(m) || isFT(m));


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
        row.className = "today-row";

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
          // no local text flip here; repaint comes from saved:updated
        };

        const details = document.createElement("span");
        details.className = "match-details";
        details.textContent = "ⓘ";
        details.onclick = e => {
          e.stopPropagation();
          emit("details-open", { match: m });
        };

        right.appendChild(info);
        right.appendChild(save);
        right.appendChild(details);

        row.appendChild(left);
        row.appendChild(right);

        // normal click → center panels / odds
        row.onclick = () => {
          emit("match-selected", m);
          emit("active-match:set", m);
        };

        root.appendChild(row);
      });
    });
  }

  // data from Today (source of truth feed)
  on("today-matches:loaded", payload => {
    render(payload && payload.matches ? payload.matches : []);
  });

  // canonical saved sync
  on("saved:updated", payload => {
    syncSavedSet(payload && Array.isArray(payload.items) ? payload.items : []);
    if (LAST_MATCHES.length) render(LAST_MATCHES);
  });

  // legacy saved sync (optional)
  on("saved:changed", arr => {
    syncSavedSet(Array.isArray(arr) ? arr : []);
    if (LAST_MATCHES.length) render(LAST_MATCHES);
  });

  // initial paint snapshot (if store already loaded)
  try {
    syncSavedSet(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}
})();
