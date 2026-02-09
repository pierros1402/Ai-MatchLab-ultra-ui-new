/* =========================================================
   LIVE MATCHES PANEL (v3.2 FIXED LEAGUE NAME)
========================================================= */

(function () {
  if (!window.on || !window.emit) return;

  const panel =
    document.querySelector(".right-column .intelligence-panel.live-panel") ||
    document.querySelector(".intelligence-panel.live-panel");
  if (!panel) return;

  const header = panel.querySelector(".panel-header");
  const body = panel.querySelector("#live-list");
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

  function getLeagueFromTodayById(matchId) {
    try {
      const obj = window.AIML_FIXTURES_TODAY;
      const arr = obj && Array.isArray(obj.matches) ? obj.matches : [];
      const hit = arr.find(x => String(x?.id ?? "") === String(matchId));
      return hit?.leagueName || hit?.leagueSlug || "";
    } catch {
      return "";
    }
  }

  function rawLeague(m) {
    const id = String(m?.id ?? "");
    const fromToday = id ? getLeagueFromTodayById(id) : "";
    if (fromToday) return fromToday;

    return (
      m?.leagueName ||
      m?.league ||
      m?.competitionName ||
      m?.competition ||
      m?.tournament ||
      m?.stageName ||
      "SOCCER"
    );
  }

  function prettyLeagueName(raw) {
    const s = String(raw || "").trim();
    if (!s) return "SOCCER";

    if (s.toLowerCase() === "regular-season") return "LIVE";

    const noSeason = s.replace(/^\d{4}-\d{2}-/g, "");
    const t = noSeason.replace(/-/g, " ").toLowerCase().trim();

    const map = {
      "english premier league": "Premier League",
      "laliga": "LaLiga",
      "german bundesliga": "Bundesliga",
      "italian serie a": "Serie A",
      "french ligue 1": "Ligue 1",
      "uefa champions league": "UEFA Champions League",
      "greek super league": "Super League Greece"
    };

    if (map[t]) return map[t];
    return t.replace(/\b\w/g, c => c.toUpperCase());
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

  function getSavedIds() {
    try {
      if (!window.getSavedMatches) return new Set();
      return new Set(
        (window.getSavedMatches() || [])
          .map(x => String(x?.id ?? ""))
          .filter(Boolean)
      );
    } catch {
      return new Set();
    }
  }

  const FT_KEEP_MS = 120000;
  const ftSeenAt = new Map();

  function filterWithFTRetention(matches) {
    const now = Date.now();
    const live = [];
    const ft = [];

    for (const m of matches) {
      const st = normalizeStatus(m);

      if (st === "LIVE") {
        live.push(m);
        ftSeenAt.delete(String(m?.id ?? ""));
        continue;
      }

      if (st === "FT") {
        const id = String(m?.id ?? "");
        if (!ftSeenAt.has(id)) ftSeenAt.set(id, now);

        if ((now - ftSeenAt.get(id)) <= FT_KEEP_MS) {
          ft.push(m);
        }
      }
    }

    return { live, ft };
  }

  function groupByLeague(list) {
    const map = new Map();
    for (const m of list) {
      const league = prettyLeagueName(rawLeague(m));
      if (!map.has(league)) map.set(league, []);
      map.get(league).push(m);
    }
    return map;
  }

  function render(allMatches) {
    body.innerHTML = "";

    if (!Array.isArray(allMatches)) {
      body.innerHTML = "<div class='panel-placeholder'>Waiting...</div>";
      return;
    }

    const { live, ft } = filterWithFTRetention(allMatches);
    const combined = live.concat(ft);

    if (!combined.length) {
      body.innerHTML = "<div class='panel-placeholder'>No live matches.</div>";
      return;
    }

    const savedIds = getSavedIds();
    const grouped = groupByLeague(combined);

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
        const meta = esc((formatMinute(m) + " " + formatScore(m)).trim());

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

  window.on("live:update", payload => {
    render(payload?.matches || []);
  });

  render(null);
})();
