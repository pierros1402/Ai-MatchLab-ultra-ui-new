/* =========================================================
   LIVE MATCHES PANEL (v4.0 FIXED EVENTS + STATUS SAFE)
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const panel =
    document.querySelector(".right-column .intelligence-panel.live-panel") ||
    document.querySelector(".intelligence-panel.live-panel");
  if (!panel) return;

  const header = panel.querySelector(".panel-header");
  const body =
    panel.querySelector("#live-list") ||
    panel.querySelector(".panel-body") ||
    panel.querySelector(".panel-content") ||
    panel;

  if (!header || !body) return;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeStatus(m) {
    return String(m?.status ?? "").toUpperCase();
  }

  function isLiveStatus(st) {
    const s = String(st || "").toUpperCase();
    return (
      s === "LIVE" ||
      s.includes("LIVE") ||
      s.includes("IN_PROGRESS") ||
      s.includes("IN-PROGRESS") ||
      s.includes("STATUS_IN_PROGRESS")
    );
  }

  function formatMinute(m) {
    const raw = m?.minute ?? "";
    if (!raw) return "";
    const n = Number(raw);
    if (!Number.isNaN(n)) return n + "'";
    return raw + "'";
  }

  function formatScore(m) {
    const h = m?.scoreHome ?? "";
    const a = m?.scoreAway ?? "";
    if (h === "" || a === "") return "";
    return h + "-" + a;
  }

  function getLeagueName(m) {
    return (
      m?.leagueName ||
      m?.leagueSlug ||
      m?.league ||
      m?.competitionName ||
      "SOCCER"
    );
  }

  function groupByLeague(list) {
    const map = new Map();
    for (const m of list) {
      const league = getLeagueName(m);
      if (!map.has(league)) map.set(league, []);
      map.get(league).push(m);
    }
    return map;
  }

  function render(allMatches) {
    body.innerHTML = "";

    if (!Array.isArray(allMatches)) {
      body.innerHTML = "<div class='panel-placeholder'>No live matches.</div>";
      return;
    }

    const liveMatches = allMatches.filter(m =>
      isLiveStatus(normalizeStatus(m))
    );

    if (!liveMatches.length) {
      body.innerHTML = "<div class='panel-placeholder'>No live matches.</div>";
      return;
    }

    const grouped = groupByLeague(liveMatches);

    for (const [league, list] of grouped.entries()) {
      const block = document.createElement("div");
      block.className = "league-block";

      const title = document.createElement("div");
      title.className = "league-title";
      title.textContent = league;
      block.appendChild(title);

      list.forEach(m => {
        const row = document.createElement("div");
        row.className = "match-row live-row";

        const teams = esc((m.home || "") + " – " + (m.away || ""));
        const meta = esc(
          (formatMinute(m) + " " + formatScore(m)).trim()
        );

        row.innerHTML =
          "<div class='teams'>" + teams + "</div>" +
          "<div class='meta'>" + meta + "</div>";

        row.addEventListener("click", () => {
          window.emit("match-selected", m);
          window.emit("active-match:set", m);
        });

        block.appendChild(row);
      });

      body.appendChild(block);
    }
  }

  // ---------------------------
  // CORRECT EVENT REGISTRATION
  // ---------------------------

  window.on("live:update", payload => {
    render(payload?.matches || []);
  });

  window.on("today-matches:loaded", payload => {
    render(payload?.matches || []);
  });

  // Initial paint from cache if exists
  try {
    render(window.AIML_FIXTURES_TODAY?.matches || []);
  } catch (_) {}

})();