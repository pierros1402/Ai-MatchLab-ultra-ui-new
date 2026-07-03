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
      /(^|\s)FT(\s|$)/.test(s) ||
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

    // Group by COUNTRY → LEAGUE. Country header sits above the first league of
    // each country; leagues inside a country are ordered by tier (1st league
    // first), then name. Matches with no known country fall into a trailing
    // "Other" bucket rendered without a country header.
    const byCountry = new Map(); // country → Map(leagueKey → { name, tier, arr })

    for (const m of matches) {
      const country = m.country || "";
      const leagueKey = m.leagueName || m.leagueSlug || "Other";
      if (!byCountry.has(country)) byCountry.set(country, new Map());
      const leagues = byCountry.get(country);
      if (!leagues.has(leagueKey)) {
        leagues.set(leagueKey, { name: leagueKey, tier: m.leagueTier ?? null, arr: [] });
      }
      leagues.get(leagueKey).arr.push(m);
    }

    const sortedCountries = Array.from(byCountry.keys()).sort((a, b) => {
      if (!a) return 1;          // empty country ("Other") last
      if (!b) return -1;
      return a.localeCompare(b);
    });

    for (const country of sortedCountries) {
      const sec = document.createElement("div");

      if (country) {
        const countryHeader = document.createElement("div");
        countryHeader.className = "today-country";
        countryHeader.textContent = country;
        sec.appendChild(countryHeader);
      }

      const leagues = Array.from(byCountry.get(country).values())
        .sort((a, b) => {
          const ta = a.tier == null ? 99 : a.tier;
          const tb = b.tier == null ? 99 : b.tier;
          if (ta !== tb) return ta - tb;
          return a.name.localeCompare(b.name);
        });

      for (const league of leagues) {
        league.arr.sort(sortMatches);

        const header = document.createElement("div");
        header.className = "today-league";
        header.textContent = league.name;
        sec.appendChild(header);

        for (const m of league.arr) {
          sec.appendChild(buildMatchRow(m));
        }
      }

      mount.appendChild(sec);
    }
  }

  function buildMatchRow(m) {
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

      // Active contract: live-in-progress remains displayed as PRE until final.
      // Raw/live status is still preserved on the match object for live/details panels.
      info.textContent = "PRE";
      info.style.color = "";

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

    return row;
  }

  // Track which date the user has navigated to (null = today)
  let viewingDate = null;

  function todayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  }

  function selectedDateKey() {
    return String(window.__AIML_SELECTED_DATE || todayKey()).slice(0, 10);
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
// --------------------------------------------------
// LIVE SCORE SYNC
// --------------------------------------------------
if (window.on) {
  on("live:update", payload => {
    try {
      // Don't update live scores when viewing a past/future date
      if (viewingDate) return;
      if (!payload?.matches?.length) return;

      const map = new Map(LAST_MATCHES.map(m => [String(m.id ?? m.matchId), m]));

      for (const m of payload.matches) {
        const existing = map.get(String(m.id || m.matchId));
        if (!existing) continue;
        existing.status    = m.status;
        existing.rawStatus = m.rawStatus;
        existing.statusType = m.statusType;
        existing.statusName = m.statusName;
        existing.scoreHome = m.scoreHome;
        existing.scoreAway = m.scoreAway;
        existing.penalties = m.penalties;
        existing.decidedBy = m.decidedBy;
        existing.minute    = m.minute;
      }

      render({ matches: Array.from(map.values()) });
    } catch (err) {
      console.error("[active-leagues-panel] live:update error:", err);
    }
  });
}
  if (window.__AIML_LAST_ACTIVE) {
    render(window.__AIML_LAST_ACTIVE);
  }

})();