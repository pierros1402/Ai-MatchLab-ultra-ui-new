/* ============================================================
   assets/js/ui/active-leagues-panel.js (STABLE v2.5)
   - Fully aligned with TODAY panel logic
   - Save state synced (★ / ☆)
============================================================ */
(function () {
  "use strict";

  let SAVED_IDS = new Set();
  let LAST_MATCHES = [];
  let LAST_SIG = "";

  function pad2(n) { return String(n).padStart(2, "0"); }

  function timeHHMM(ms) {
    if (!ms) return "--:--";
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function normStatus(value) {
    if (value && typeof value === "object") {
      return [
        value?.status?.type?.state,
        value?.status?.type?.name,
        value?.status,
        value?.rawStatus,
        value?.statusType,
        value?.statusName,
        value?.state,
        value?.phase,
        value?.completed === true ? "COMPLETED" : ""
      ]
        .filter(Boolean)
        .map(x => String(x).toUpperCase())
        .join(" ");
    }

    return String(value || "").toUpperCase();
  }

  function isFinalStatus(status) {
    const s = normStatus(status);
    return (
      s === "FT" ||  // 👈 ΑΥΤΟ ΛΕΙΠΕ
      s.includes("FULL_TIME") ||
      s.includes("FINAL") ||
      s.includes("AET") ||
      s.includes("PEN") ||
      s.includes("POST") ||
      s.includes("COMPLETE")
    );
  }

  function isLiveStatus(status) {
    const s = normStatus(status);
    if (s.includes("STALE_LIVE")) return false;
    return s.includes("LIVE") || s.includes("FIRST_HALF") || s.includes("SECOND_HALF") || s.includes("HALFTIME") || s.includes("INPROGRESS");
  }

  function isPostponedOrCanceled(status) {
    const s = normStatus(status);
    return (
      s.includes("POSTPON") ||
      s.includes("CANCEL") ||
      s.includes("ABANDON") ||
      s.includes("SUSPEND")
    );
  }

  function formatFinalScore(m, h, a) {
    const penHome = m?.penalties?.home ?? m?.penaltyHome ?? m?.pensHome ?? m?.shootoutHome;
    const penAway = m?.penalties?.away ?? m?.penaltyAway ?? m?.pensAway ?? m?.shootoutAway;
    const raw = normStatus(m);
    const decidedByPens =
      String(m?.decidedBy || "").toLowerCase().includes("pen") ||
      raw.includes("PEN");

    if (decidedByPens && penHome != null && penAway != null) {
      return "FT " + h + "-" + a + " (" + penHome + "-" + penAway + " pens)";
    }

    if (raw.includes("AET") || String(m?.decidedBy || "").toLowerCase().includes("aet")) {
      return "AET " + h + "-" + a;
    }

    return "FT " + h + "-" + a;
  }

  function sortMatches(a, b) {

    const aFinal = isFinalStatus(a);
    const bFinal = isFinalStatus(b);

  // PRE first, FT last
    if (aFinal !== bFinal) {
      return aFinal ? 1 : -1;
    }

    const ta = Number(a.kickoff_ms || 0);
    const tb = Number(b.kickoff_ms || 0);

    if (ta !== tb) return ta - tb;

    return 0;
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

  function getMount() {
    return document.getElementById("active-leagues-list");
  }

  function render(payload) {
    const mount = getMount();
    if (!mount) return;

    const rawMatches = Array.isArray(payload?.matches) ? payload.matches : [];

    const matches = rawMatches.map(m => ({
      ...m,
      id: m.id ?? m.matchId,
      home: m.home ?? m.homeTeam,
      away: m.away ?? m.awayTeam,
      kickoff_ms:
        m.kickoff_ms != null
          ? Number(m.kickoff_ms)
          : (m.kickoffUtc ? new Date(m.kickoffUtc).getTime() : 0)
    }));

    const sig = matches.map(m => [m.id, m.status, m.rawStatus, m.minute, m.scoreHome, m.scoreAway, m?.penalties?.home, m?.penalties?.away, m.decidedBy].join(":")).join("|");
    if (sig === LAST_SIG) return;

    LAST_SIG = sig;
    LAST_MATCHES = matches;

    mount.innerHTML = "";

    if (!matches.length) {
      mount.innerHTML = "<div class='empty'>No matches.</div>";
      return;
    }

    const byLeague = new Map();

    for (const m of matches) {
      const key = m.leagueName || m.leagueSlug || "Other";
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key).push(m);
    }

    for (const [lg, arr] of Array.from(byLeague.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))) {

      arr.sort(sortMatches);

      const sec = document.createElement("div");

      const header = document.createElement("div");
      header.className = "today-league";
      header.textContent = lg;
      sec.appendChild(header);

      for (const m of arr) {

        const row = document.createElement("div");
        row.className = "match-row today-row";

        const left = document.createElement("div");
        left.className = "today-match";
        left.textContent = `${m.home || "?"} – ${m.away || "?"}`;

        const right = document.createElement("div");
        right.className = "today-right";

        const info = document.createElement("span");
        info.className = "match-info";

        const status = normStatus(m);

        if (isPostponedOrCanceled(status)) {

          info.textContent = "PP";

        } else if (isFinalStatus(status)) {

          const h = m.scoreHome ?? 0;
          const a = m.scoreAway ?? 0;
          info.textContent = formatFinalScore(m, h, a);

        } else if (isLiveStatus(status)) {

          const h = m.scoreHome ?? 0;
          const a = m.scoreAway ?? 0;
          const min = m.minute ? `${m.minute}'` : "LIVE";
          info.textContent = `${min} ${h}-${a}`;
          info.style.color = "#ff6b35";

        } else {

          info.textContent = timeHHMM(m.kickoff_ms);

        }

        // ⭐ SAVE (synced)
        const save = document.createElement("span");
        save.className = "match-save";
        save.textContent = isSaved(m) ? "★" : "☆";
        save.onclick = (e) => {
          e.stopPropagation();
          if (window.emit) emit("save-toggle", m);
        };

        // ⓘ DETAILS
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

        // Row → odds
        row.onclick = () => {
          if (window.emit) {
            emit("match-selected", m);
            emit("active-match:set", m);
            emit("nav:oic", { tab: "odds" });
          }
        };

        sec.appendChild(row);
      }

      mount.appendChild(sec);
    }
  }

  // Track which date the user has navigated to (null = today)
  let viewingDate = null;

  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  }

  document.addEventListener("active-leagues:updated", function (e) {
    try {
      const detail = e?.detail || null;
      // Record which date is being viewed so snapshot:update knows to back off
      viewingDate = (detail && detail.date && detail.date !== todayKey()) ? detail.date : null;
      render(detail);
    } catch (err) {
      console.error("[active-leagues-panel] render error:", err);
    }
  });

  // sync saved state like Today
  if (window.on) {
    on("saved:updated", payload => {
      syncSaved(payload?.items || []);
      render({ matches: LAST_MATCHES });
    });
  }

  try {
    syncSaved(window.getSavedMatches ? window.getSavedMatches() : []);
  } catch {}

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

// --------------------------------------------------
// LIVE SCORE SYNC
// --------------------------------------------------
if (window.on) {
  on("live:update", payload => {
    try {
      if (viewingDate) return;
      if (!payload?.matches?.length) return;

      const index = buildLiveJoinIndex(LAST_MATCHES);

      for (const m of payload.matches) {
        const existing = findLiveJoinTarget(index, m);
        if (!existing) continue;
        applyLivePatch(existing, m);
      }

      render({ matches: LAST_MATCHES });
    } catch (err) {
      console.error("[active-leagues-panel] live:update error:", err);
    }
  });
}
  if (window.__AIML_LAST_ACTIVE) {
    render(window.__AIML_LAST_ACTIVE);
  }

})();