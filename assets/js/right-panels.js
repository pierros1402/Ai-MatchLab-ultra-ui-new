/* =========================================================
   AI MatchLab ULTRA — right-panels.js (FINAL)
   Responsibilities:
   - Render LIVE / RADAR / TOP PICKS
   - SAME league naming as Today / Active
========================================================= */

(function () {
  "use strict";
  if (window.__AIML_RIGHT_PANELS_FINAL__) return;
  window.__AIML_RIGHT_PANELS_FINAL__ = true;

  function onSafe(ev, fn) {
    if (typeof window.on === "function") window.on(ev, fn);
    else document.addEventListener(ev, e => fn(e.detail));
  }
  function emitSafe(ev, data) {
    if (typeof window.emit === "function") window.emit(ev, data);
    else document.dispatchEvent(new CustomEvent(ev, { detail: data }));
  }

  const esc = s =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  /* =========================
     FIXTURE → LEAGUE MAP (FROM TODAY)
     ========================= */

  const fixtureLeagueById = Object.create(null);

  onSafe("today-matches:loaded", payload => {
    const list = payload?.matches || [];
    list.forEach(m => {
      if (m.id && m.leagueName) {
        fixtureLeagueById[m.id] = m.leagueName;
      }
    });
  });

  /* =========================
     LIVE PANEL
     ========================= */

  const els = { liveMeta: null, liveList: null };
  function resolveLive() {
    els.liveMeta = els.liveMeta || document.getElementById("live-meta");
    els.liveList = els.liveList || document.getElementById("live-list");
  }

  function minuteText(m) {
    if (m.minute != null) return `${esc(m.minute)}′`;
    if (m.clock != null) return `${esc(m.clock)}′`;
    return "";
  }
  function scoreText(m) {
    if (m.score_text) return esc(m.score_text);
    if (m.scoreHome != null && m.scoreAway != null)
      return `${esc(m.scoreHome)}–${esc(m.scoreAway)}`;
    return "";
  }

  let liveMatches = [];

  function renderLive() {
    resolveLive();
    if (!els.liveList) return;

    if (els.liveMeta)
      els.liveMeta.textContent = `Live • ${liveMatches.length}`;

    if (!liveMatches.length) {
      els.liveList.innerHTML =
        "<div class='empty-state'>No live matches right now</div>";
      return;
    }

    const sorted = liveMatches
      .slice()
      .sort((a, b) => (a.kickoff_ms || 0) - (b.kickoff_ms || 0));

    const groups = {};
    sorted.forEach(m => {
      const league =
        fixtureLeagueById[m.id] ||
        m.leagueName ||
        m.leagueSlug ||
        "—";

      (groups[league] = groups[league] || []).push(m);
    });

    let html = "";
    Object.keys(groups)
      .sort()
      .forEach(lg => {
        html += `<div class="live-group">
          <div class="live-league">${esc(lg)}</div>`;

        groups[lg].forEach(m => {
          const min = minuteText(m);
          const sco = scoreText(m);
          html += `
            <div class="right-item live-item"
                 data-id="${esc(m.id)}"
                 data-home="${esc(m.home)}"
                 data-away="${esc(m.away)}">
              <div class="right-main">
                <strong>${esc(m.home)} – ${esc(m.away)}</strong>
              </div>
              <div class="right-sub">
                ${min}${min && sco ? " • " : ""}${sco}
              </div>
            </div>`;
        });

        html += `</div>`;
      });

    els.liveList.innerHTML = html;
  }

  onSafe("live:update", ({ matches }) => {
    liveMatches = Array.isArray(matches)
      ? matches.filter(m => m.status === "LIVE")
      : [];
    renderLive();
  });

  document.addEventListener("click", e => {
    const item = e.target.closest(".live-item");
    if (!item) return;

    emitSafe("match-selected", {
      id: item.dataset.id,
      home: item.dataset.home,
      away: item.dataset.away
    });

    document.body.classList.remove("drawer-right-open");
  });

  /* =========================
     TABS (Radar / Top Picks)
     ========================= */

  const tabs = document.querySelectorAll(".right-tab");
  const cards = {
    radar: document.getElementById("card-radar"),
    "top-picks": document.getElementById("card-top-picks")
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.target;
      Object.keys(cards).forEach(k => {
        if (!cards[k]) return;
        cards[k].style.display = k === target ? "block" : "none";
      });
    });
  });

  /* =========================
     RADAR PANEL
     ========================= */

  let radarItems = [];

  onSafe("radar:update", ({ items }) => {
    radarItems = Array.isArray(items) ? items : [];
    renderRadar();
  });

  function renderRadar() {
    const el = document.getElementById("radar-list");
    if (!el) return;

    if (!radarItems.length) {
      el.innerHTML = "<div class='empty-state'>No radar signals</div>";
      return;
    }

    el.innerHTML = radarItems.map(ev => `
      <div class="right-item radar-item">
        <div class="right-main">
          <strong>${esc(ev.home || "")} – ${esc(ev.away || "")}</strong>
        </div>
        <div class="right-sub">
          ${esc(ev.market)} • ${esc(ev.provider)} • Δ${Number(ev.delta).toFixed(2)}
        </div>
      </div>
    `).join("");
  }

  /* =========================
     AI PICKS PANEL
     ========================= */

  let aiPicks = [];

  onSafe("aipicks:update", ({ items }) => {
    aiPicks = Array.isArray(items) ? items : [];
    renderAIPicks();
  });

  function renderAIPicks() {
    const el = document.getElementById("top-picks-list");
    if (!el) return;

    if (!aiPicks.length) {
      el.innerHTML = "<div class='empty-state'>No AI picks</div>";
      return;
    }

    el.innerHTML = aiPicks.map(p => `
      <div class="right-item pick-item">
        <div class="right-main">
          <strong>${esc(p.selection)}</strong> @ ${esc(p.current)}
        </div>
        <div class="right-sub">
          ${esc(p.market)} • edge ${(p.edge * 100).toFixed(1)}%
        </div>
      </div>
    `).join("");
  }

  renderLive();
})();
