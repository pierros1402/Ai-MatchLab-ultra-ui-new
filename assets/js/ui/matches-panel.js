/* matches-panel.js (patched: auto-switch to ODDS on match select) */

(() => {
  if (!window.AIML || !window.AIML.emit) return;

  const { on, emit, getState } = window.AIML;

  const $ = (id) => document.getElementById(id);

  const root = $("matches-panel");
  if (!root) return;

  let matches = [];
  let activeLeague = null;
  let activeDate = null;

  function todayStr() {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  }

  function isFutureDate(date) {
    return date && date > todayStr();
  }

  function fmt(p) { return p != null ? (Math.round(p * 100)) + "%" : "–"; }

  function assessmentHtml(a) {
    if (!a) return "";
    const p = a.currentAssessment || a.openAssessment || {};
    const revisedBadge = a.revised
      ? `<span class="assess-revised">REVISED</span>`
      : "";
    return `
      <div class="match-assess">
        ${revisedBadge}
        <span class="assess-cell assess-home">${fmt(p.home)}</span>
        <span class="assess-label">1</span>
        <span class="assess-cell assess-draw">${fmt(p.draw)}</span>
        <span class="assess-label">X</span>
        <span class="assess-cell assess-away">${fmt(p.away)}</span>
        <span class="assess-label">2</span>
      </div>
    `;
  }

  function renderEmpty() {
    root.innerHTML = `
      <div class="panel-empty">
        <div class="muted">No matches loaded.</div>
      </div>
    `;
  }

  function renderList() {
    if (!matches || !matches.length) {
      renderEmpty();
      return;
    }

    const isFuture = isFutureDate(activeDate);

    const rows = matches
      .map((m) => {
        const id = m.id || m.matchId || "";
        const home = m.home || m.homeTeam || m.homeTeamName || "Home";
        const away = m.away || m.awayTeam || m.awayTeamName || "Away";
        const status = m.status || m.state || m.shortStatus || "";
        const time = m.kickoff || m.kickoffTime || m.time || "";

        const scoreHome = m.scoreHome;
        const scoreAway = m.scoreAway;
        const hasScore  = scoreHome != null && scoreAway != null;
        const scoreHtml = hasScore
          ? `<span class="match-score">${scoreHome}–${scoreAway}</span>`
          : "";

        const extraHtml = isFuture ? assessmentHtml(m.assessment) : "";

        return `
          <button class="match-row${isFuture ? " match-row-future" : ""}" data-mid="${id}">
            <div class="match-row-main">
              <div class="match-teams">
                <span class="team home">${home}</span>
                ${hasScore ? scoreHtml : `<span class="vs">vs</span>`}
                <span class="team away">${away}</span>
              </div>
              <div class="match-meta">
                <span class="match-time">${time}</span>
                <span class="match-status">${status}</span>
              </div>
            </div>
            ${extraHtml}
          </button>
        `;
      })
      .join("");

    root.innerHTML = `<div class="match-list">${rows}</div>`;

    // click binding
    root.querySelectorAll(".match-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mid = btn.getAttribute("data-mid");
        const match = matches.find((x) => String(x.id || x.matchId) === String(mid));
        if (match) {
          // Attach the active date so multi-odds-loader uses the right date file
          const enriched = Object.assign({}, match);
          if (!enriched.date && window.DateNav) enriched.date = window.DateNav.getActiveDate();
          selectMatch(enriched);
        }
      });
    });
  }

  function selectMatch(match) {
    // 1) open details (existing behavior)
    emit("details-open", match);

    // 2) broadcast selection (existing behavior)
    emit("match-selected", match);
    emit("active-match:set", match);

    // 3) ✅ NEW: auto-switch to ODDS on mobile (safe no-op on desktop)
    try {
      if (typeof window.AIML_MOBILE_SET_VIEW === "function") {
        window.AIML_MOBILE_SET_VIEW("odds");
      } else {
        // fallback: if your mobile-ui listens to this event
        emit("mobile-view:set", "odds");
      }
    } catch (_) {}
  }

  // Incoming matches list (existing style)
  on("matches:set", (payload) => {
    matches = (payload && payload.matches) ? payload.matches : (Array.isArray(payload) ? payload : []);
    if (payload && payload.date) activeDate = payload.date;
    renderList();
  });

  window.addEventListener("date:change", (e) => {
    activeDate = e.detail?.date || null;
  });

  // If league changes, you may receive an event (keep compatible)
  on("active-league:set", (lg) => {
    activeLeague = lg || null;
  });

  // Initial
  renderEmpty();
})();
