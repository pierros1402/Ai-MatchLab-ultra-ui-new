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
    (window.AIML_LIVE_CFG && window.AIML_LIVE_CFG.fixturesBase)
      ? window.AIML_LIVE_CFG.fixturesBase
      : "http://localhost:3010";

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
   if (!st) return false;

   const s = String(st).toUpperCase();

   if (s.includes("STALE_LIVE")) return false;

   return (
     s === "LIVE" ||
     s.includes("IN_PROGRESS") ||
     s.includes("LIVE") ||
     s.includes("FIRST_HALF") ||
     s.includes("SECOND_HALF") ||
     s.includes("HALF_TIME") ||
     s.includes("EXTRA_TIME") ||
     s.includes("STATUS_FIRST_HALF") ||
     s.includes("STATUS_SECOND_HALF") ||
     s.includes("STATUS_HALFTIME")
   );
 }

 function matchStatusText(m) {
   return [
     m?.status,
     m?.rawStatus,
     m?.statusType,
     m?.statusName,
     m?.state,
     m?.phase,
     m?.live === true || m?.isLive === true ? "LIVE" : ""
   ]
     .filter(Boolean)
     .map(x => String(x).toUpperCase())
     .join(" ");
 }

 function isStaleLiveMatch(m) {
   return (
     m?.staleLive === true ||
     String(m?.status || "").toUpperCase() === "STALE_LIVE" ||
     String(m?.rawStatus || "").toUpperCase() === "STALE_LIVE" ||
     String(m?.statusType || "").toUpperCase() === "STALE_LIVE" ||
     matchStatusText(m).includes("STALE_LIVE")
   );
 }

 function isMatchLive(m) {
   if (isStaleLiveMatch(m)) return false;
   return isLiveStatus(matchStatusText(m));
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

        const st = matchStatusText(m);
        const ko = Number(m.kickoff_ms || 0);

        const isPre = st === "PRE" || st.includes("SCHEDULED");
        const isLive = isMatchLive(m);

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
      const st = matchStatusText(m);

      if (isMatchLive(m)) {
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
      const raw = Array.isArray(data.matches) ? data.matches : [];

      const matches = raw.map(m => ({
        id: m.id ?? m.matchId,
        home: m.home ?? m.homeTeam,
        away: m.away ?? m.awayTeam,
        leagueName: m.leagueName,
        leagueSlug: m.leagueSlug,
        status: m.status,
        rawStatus: m.rawStatus,
        statusType: m.statusType,
        statusName: m.statusName,
        state: m.state,
        phase: m.phase,
        live: m.live,
        isLive: m.isLive,
        staleLive: m.staleLive,
        staleLiveReason: m.staleLiveReason,
        scoreHome: m.scoreHome,
        scoreAway: m.scoreAway,
        minute: m.minute,

        kickoff_ms:
          m.kickoff_ms != null
            ? Number(m.kickoff_ms)
            : (m.kickoffUtc ? new Date(m.kickoffUtc).getTime() : 0),

        __raw: m
      }));

      window.AIML_FIXTURES_TODAY = { matches };

      render(matches);

      safeEmit("today-matches:loaded", { matches });

// ----------------------------------
// SYNC WITH LIVE SNAPSHOT
// ----------------------------------
 

      const hasLive = matches.some(m => isMatchLive(m));

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


function normLiveJoinKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function liveMatchDayKey(m) {
  const raw = m?.kickoffUtc || m?.kickoff || m?.startTime || null;
  const ms = raw ? Date.parse(String(raw)) : Number(m?.kickoff_ms || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function liveJoinAliases(m) {
  const keys = new Set();
  const add = value => {
    if (value == null) return;
    const s = String(value).trim();
    if (s) keys.add(s);
  };

  add(m?.id);
  add(m?.matchId);
  add(m?.canonicalId);
  add(m?.sourceId);

  if (Array.isArray(m?.sourceIds)) {
    m.sourceIds.forEach(add);
  }

  const sourceId = String(m?.sourceId || "").replace(/^fs_/, "").trim();
  if (sourceId) {
    add(sourceId);
    add("fs_" + sourceId);
  }

  const home = normLiveJoinKey(m?.home || m?.homeTeam);
  const away = normLiveJoinKey(m?.away || m?.awayTeam);
  const league = normLiveJoinKey(m?.leagueSlug || m?.leagueName);
  const day = liveMatchDayKey(m);

  if (home && away) {
    add("teams:" + home + "|" + away);
    if (league) add("teams-league:" + league + "|" + home + "|" + away);
    if (day) add("teams-date:" + day + "|" + home + "|" + away);
    if (day && league) add("teams-date-league:" + day + "|" + league + "|" + home + "|" + away);
  }

  return Array.from(keys);
}

function buildLiveJoinIndex(matches) {
  const map = new Map();
  for (const match of Array.isArray(matches) ? matches : []) {
    for (const key of liveJoinAliases(match)) {
      if (!map.has(key)) map.set(key, match);
    }
  }
  return map;
}

function findLiveJoinTarget(index, patch) {
  for (const key of liveJoinAliases(patch)) {
    const existing = index.get(key);
    if (existing) return existing;
  }
  return null;
}

function applyLivePatch(existing, patch) {
  existing.status = patch.status;
  existing.rawStatus = patch.rawStatus;
  existing.statusType = patch.statusType;
  existing.statusName = patch.statusName;
  existing.state = patch.state;
  existing.phase = patch.phase;
  existing.live = patch.live;
  existing.isLive = patch.isLive;
  existing.staleLive = patch.staleLive;
  existing.staleLiveReason = patch.staleLiveReason;
  existing.minute = patch.minute;
  existing.scoreHome = patch.scoreHome;
  existing.scoreAway = patch.scoreAway;
  existing.penalties = patch.penalties || existing.penalties;
  existing.decidedBy = patch.decidedBy || existing.decidedBy;
}

// ----------------------------------
// LIVE SYNC (CRITICAL)
// ----------------------------------
if (window.on) {
  on("live:update", payload => {
    if (!payload?.matches?.length) return;

    const index = buildLiveJoinIndex(LAST_MATCHES);

    for (const m of payload.matches) {
      const existing = findLiveJoinTarget(index, m);
      if (!existing) continue;
      applyLivePatch(existing, m);
    }

    render(LAST_MATCHES);
  });
}

})();