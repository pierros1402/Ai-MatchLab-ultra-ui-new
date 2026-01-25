/* =====================================================
   MATCHES PANEL – DETAILS MODE (SAFE, ISOLATED)
   Role:
   - Opens ONLY via `details-open`
   - Displays full match information
   - Does NOT listen to fixtures / leagues
===================================================== */

(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(() => {
    if (typeof window.on !== "function" || typeof window.emit !== "function") return;

    const PANEL_ID = "panel-matches";
    const BODY_ID = "matches-list";

    function $(id) {
      return document.getElementById(id);
    }

    let CURRENT_MATCH = null;

    /* ===============================
       OPEN PANEL
    =============================== */
    function openPanel() {
      const panel = $(PANEL_ID);
      if (!panel) return;

      panel.classList.add("open");

      if (typeof window.openAccordion === "function") {
        window.openAccordion(PANEL_ID);
      }
    }

    /* ===============================
       RENDER
    =============================== */
    function render(match) {
      const body = $(BODY_ID);
      if (!body || !match) return;

      body.innerHTML = `
        <div class="details-header">
          <div class="teams">
            <strong>${match.home}</strong>
            <span>vs</span>
            <strong>${match.away}</strong>
          </div>
          <div class="league">${match.leagueName || ""}</div>
          <div class="time">
            ${renderStatus(match)}
          </div>
        </div>

        <div class="details-section" id="details-stats">
          <h4>Team Stats</h4>
          <div class="placeholder">Loading stats…</div>
        </div>

        <div class="details-section" id="details-standings">
          <h4>Standings</h4>
          <div class="placeholder">Loading standings…</div>
        </div>

        <div class="details-section" id="details-history">
          <h4>H2H / History</h4>
          <div class="placeholder">Loading history…</div>
        </div>
      `;

      // ενημερώνουμε τα υπόλοιπα panels (odds κλπ)
      emit("match-selected", match);
      emit("active-match:set", match);

      loadExtras(match);
    }

    function renderStatus(m) {
      if (m.status === "LIVE") {
        return `${m.minute ?? ""}' ${m.scoreHome ?? ""}-${m.scoreAway ?? ""}`.trim();
      }
      if (m.status === "FT") {
        return `FT ${m.scoreHome ?? ""}-${m.scoreAway ?? ""}`;
      }
      return new Date(m.kickoff_ms || m.kickoff).toLocaleTimeString("el-GR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    /* ===============================
       LOAD EXTRA DATA (SAFE)
    =============================== */
    function loadExtras(match) {
      // εδώ ΔΕΝ υποθέτουμε τίποτα
      // αν υπάρχουν workers / adapters, απλώς θα απαντήσουν

      emit("details:load:stats", match);
      emit("details:load:standings", match);
      emit("details:load:history", match);
    }

    /* ===============================
       EVENTS
    =============================== */

    // 🔑 ΜΟΝΟΣ ΤΡΟΠΟΣ ΑΝΟΙΓΜΑΤΟΣ
    on("details-open", payload => {
      if (!payload || !payload.match) return;

      CURRENT_MATCH = payload.match;
      openPanel();
      render(CURRENT_MATCH);
    });

    /* ===============================
       OPTIONAL LISTENERS (αν υπάρχουν)
    =============================== */

    on("details:stats:loaded", data => {
      const el = document.getElementById("details-stats");
      if (el && data) el.querySelector(".placeholder").textContent = JSON.stringify(data, null, 2);
    });

    on("details:standings:loaded", data => {
      const el = document.getElementById("details-standings");
      if (el && data) el.querySelector(".placeholder").textContent = JSON.stringify(data, null, 2);
    });

    on("details:history:loaded", data => {
      const el = document.getElementById("details-history");
      if (el && data) el.querySelector(".placeholder").textContent = JSON.stringify(data, null, 2);
    });
  });
})();
