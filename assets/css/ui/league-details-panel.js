// ===================================================================
// LEAGUE DETAILS PANEL — FINAL v2 (MEMORY-DRIVEN)
//
// • ΚΑΝΕΝΑ fetch (0 network calls)
// • Παίρνει snapshot από today-panel μέσω event
// • Instant open (<50ms)
// • Δείχνει LIVE + UPCOMING + FT + POSTPONED για τη λίγκα
// • Click σε αγώνα → Match Details (details-panel.js)
// ===================================================================
(function () {
  "use strict";

  const panel = document.getElementById("panel-league-details");
  if (!panel) return;

  const listEl = panel.querySelector("#league-details-list");
  if (!listEl) return;

  const titleEl = panel.querySelector(".panel-title");

  // -------------------- MEMORY CACHE --------------------
  let DAY_CACHE = [];          // πλήρες ημερήσιο snapshot (από Today)
  let hasSnapshot = false;

  let currentLeagueId = null;
  let currentLeagueName = "";
  let isLoading = false;
  let matches = [];

  // -------------------- HELPERS --------------------
  function esc(v) {
    return String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function statusLabel(m) {
    const s = String(m?.status || "").toUpperCase();
    if (s === "LIVE" || s === "IN_PLAY" || s === "INPLAY") {
      return `<span class="live">LIVE ${m.minute || ""}'</span>`;
    }
    if (s === "FT" || s === "FINAL" || s === "FINISHED") {
      return `<span class="ft">FT ${esc(m.score || "")}</span>`;
    }
    if (s === "POSTPONED" || s === "CANCELLED" || s === "ABANDONED") {
      return `<span class="ppd">${esc(s)}</span>`;
    }
    const t = new Date(m.kickoff || m.kickoff_ms || Date.now());
    return `<span class="time">${t.toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit"
    })}</span>`;
  }

  // -------------------- RENDER --------------------
  function render() {
    if (isLoading) {
      listEl.innerHTML =
        `<div class="panel-loading">Loading league matches…</div>`;
      return;
    }

    if (!matches.length) {
      listEl.innerHTML =
        `<div class="panel-empty">No matches today.</div>`;
      return;
    }

    listEl.innerHTML = matches.map(m => `
      <div class="league-match-row" data-id="${esc(m.id)}">
        <div class="teams">${esc(m.home)} – ${esc(m.away)}</div>
        <div class="right">${statusLabel(m)}</div>
      </div>
    `).join("");

    listEl.querySelectorAll(".league-match-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        const m = matches.find(x => String(x.id) === String(id));
        if (!m) return;
        window.emit?.("details-open", { match: m, source: "league-details" });
      });
    });
  }

  // -------------------- LOAD FROM MEMORY --------------------
  function loadLeagueFromMemory(lid, lname) {
    currentLeagueId = String(lid);
    currentLeagueName = lname || lid;
    if (titleEl) titleEl.textContent = currentLeagueName;

    if (!hasSnapshot) {
      // Δεν έχει έρθει ακόμα το Today snapshot
      isLoading = true;
      matches = [];
      render();
      return;
    }

    isLoading = false;
    matches = DAY_CACHE.filter(
      m => String(m.aimlLeagueId) === currentLeagueId
    );
    render();
  }

  // -------------------- EVENTS --------------------

  // Snapshot από Today (source-of-truth)
  window.on?.("today-matches:loaded", p => {
    DAY_CACHE = Array.isArray(p?.matches) ? p.matches : [];
    hasSnapshot = true;

    // Αν έχουμε ήδη ανοικτή λίγκα, ανανέωσε άμεσα
    if (currentLeagueId) {
      loadLeagueFromMemory(currentLeagueId, currentLeagueName);
    }
  });

  // Επιλογή λίγκας από Active Leagues
  window.on?.("active-league-selected", p => {
    if (!p || !p.id) return;
    loadLeagueFromMemory(p.id, p.name);
    window.openAccordion?.("panel-league-details");
  });

  // -------------------- INIT --------------------
  listEl.innerHTML =
    `<div class="panel-empty">Select a league to view matches.</div>`;
})();
