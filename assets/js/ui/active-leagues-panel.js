/* ============================================================
   assets/js/ui/active-leagues-panel.js (STABLE v2.0)
   - Active Leagues panel mirrors the selected day:
       PRE  => STATUS_SCHEDULED (shows kickoff time)
       FT   => STATUS_FULL_TIME / STATUS_FINAL (shows score)
       PP/CAN => shown as PP (does not block finalize logic elsewhere)
   - Source:
       "active-leagues:updated" event payload from fixtures-loader.js
       window.__AIML_LAST_ACTIVE fallback
============================================================ */
(function () {
  "use strict";

  // --------- utilities ----------
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function timeHHMM(ms) {
    if (!ms) return "--:--";
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function normStatus(s) { return String(s || "").toUpperCase(); }

  function isFinalStatus(status) {
    const s = normStatus(status);
    return (
      s.includes("FULL_TIME") ||
      s.includes("FINAL") ||
      s === "FT" ||
      s === "FINAL"
    );
  }

  function isScheduledStatus(status) {
    const s = normStatus(status);
    return (
      s.includes("SCHEDULED") ||
      s === "STATUS_SCHEDULED" ||
      s === "SCHEDULED"
    );
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

  function leagueKey(m) {
    return String(m.leagueName || m.leagueSlug || "Other");
  }

  function sortMatches(a, b) {
    const ta = Number(a.kickoff_ms || 0);
    const tb = Number(b.kickoff_ms || 0);
    if (ta !== tb) return ta - tb;
    return String(a.home || "").localeCompare(String(b.home || ""));
  }

  // --------- rendering ----------
  function getMount() {
    return document.getElementById("active-leagues-list");
  }

  function render(payload) {
    const mount = getMount();
    if (!mount) return;

    const matches = (payload && Array.isArray(payload.matches)) ? payload.matches : [];
    const byLeague = new Map();

    for (const m of matches) {
      const k = leagueKey(m);
      if (!byLeague.has(k)) byLeague.set(k, []);
      byLeague.get(k).push(m);
    }

    // Clear
    mount.innerHTML = "";

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No matches.";
      mount.appendChild(empty);
      return;
    }

    // Render leagues
    for (const [lg, arr] of Array.from(byLeague.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      arr.sort(sortMatches);

      const sec = document.createElement("div");

      const h = document.createElement("div");
      h.className = "today-league";
      h.textContent = lg;
      sec.appendChild(h);

      for (const m of arr) {
        const row = document.createElement("div");
        row.className = "today-row";

        const left = document.createElement("div");
        left.className = "today-match";
        left.textContent = `${m.home || "?"} – ${m.away || "?"}`;

        const right = document.createElement("div");
        right.className = "today-right";

        const info = document.createElement("span");
        info.className = "match-info";

        const status = normStatus(m.status);
        if (isPostponedOrCanceled(status)) {
          info.textContent = "PP";
        } else if (isFinalStatus(status)) {
          const sh = (m.scoreHome ?? 0);
          const sa = (m.scoreAway ?? 0);
          info.textContent = `${sh} - ${sa}`;
        } else if (isScheduledStatus(status)) {
          info.textContent = timeHHMM(m.kickoff_ms);
        } else {
          // Live / halftime etc -> show minute if present else time
          const minute = String(m.minute || "").trim();
          info.textContent = minute ? minute : timeHHMM(m.kickoff_ms);
        }

        right.appendChild(info);

        row.appendChild(left);
        row.appendChild(right);
        sec.appendChild(row);
      }

      mount.appendChild(sec);
    }
  }

  // --------- wiring ----------
  function onUpdate(e) {
    try {
      render(e && e.detail ? e.detail : null);
    } catch (err) {
      // Don't break the whole UI
      console.error("[active-leagues-panel] render error:", err);
    }
  }

  document.addEventListener("active-leagues:updated", onUpdate);

  // Initial paint from last cache if exists
  if (window.__AIML_LAST_ACTIVE) {
    render(window.__AIML_LAST_ACTIVE);
  }

})();
