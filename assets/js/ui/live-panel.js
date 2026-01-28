/* =========================================================
   LIVE MATCHES PANEL (v3.2 FIXED LEAGUE NAME)
   - LIVE grouped by league
   - FT only for 120s
   - Saved / All dropdown inside header
   - HARD FIX: remove stale placeholders ("Waiting...")
   - Pretty league names
   - ✅ NEW: If live payload has league:"regular-season", use Today fixtures leagueName by id
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

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
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
    // ✅ BEST: real league name from Today fixtures (if available)
    const id = String(m?.id ?? "");
    const fromToday = id ? getLeagueFromTodayById(id) : "";
    if (fromToday) return fromToday;

    // fallback keys (if live worker ever starts sending them)
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

    // if live payload gives stage only, avoid showing it as league
    if (s.toLowerCase() === "regular-season" || s.toLowerCase() === "regular season") {
      return "LIVE";
    }

    // remove leading season like "2025-26-"
    const noSeason = s.replace(/^\d{4}-\d{2}-/g, "");

    // normalize hyphens -> spaces
    const t = noSeason.replace(/-/g, " ").toLowerCase().trim();

    // common mappings
    const map = {
      "english premier league": "Premier League",
      "english championship": "Championship",
      "english league one": "League One",
      "english league two": "League Two",
      "laliga": "LaLiga",
      "spanish laliga": "LaLiga",
      "german bundesliga": "Bundesliga",
      "italian serie a": "Serie A",
      "french ligue 1": "Ligue 1",
      "uefa champions league": "UEFA Champions League",
      "uefa europa league": "UEFA Europa League",
      "uefa europa conference league": "UEFA Conference League",
      "greek super league": "Super League Greece",
      "turkish super lig": "Turkish Süper Lig",
    };

    if (map[t]) return map[t];

    // Title Case fallback
    return t.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatMinute(m) {
    const raw = m?.minute ?? "";
    if (raw === "" || raw == null) return "";
    const n = Number(raw);
    if (!Number.isNaN(n) && Number.isFinite(n)) return String(n) + "'";
    return String(raw).replace(/'/g, "") + "'";
  }

  function formatScore(m) {
    const h = m?.scoreHome ?? "";
    const a = m?.scoreAway ?? "";
    if (h === "" || a === "") return "";
    return String(h) + "-" + String(a);
  }

  function getSavedIds() {
    try {
      if (typeof window.getSavedMatches !== "function") return new Set();
      const arr = window.getSavedMatches() || [];
      return new Set(arr.map((x) => String(x?.id ?? "")).filter(Boolean));
    } catch {
      return new Set();
    }
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

  // -------------------------------------------------------
  // Mode selector inside header
  // -------------------------------------------------------
  const MODE_KEY = "AIML_LIVE_MODE";
  let mode = (localStorage.getItem(MODE_KEY) || "SAVED").toUpperCase();
  if (mode !== "SAVED" && mode !== "ALL") mode = "SAVED";

  function setMode(next) {
    mode = String(next || "SAVED").toUpperCase();
    if (mode !== "SAVED" && mode !== "ALL") mode = "SAVED";
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    paint(true);
  }

  function ensureHeaderDropdown() {
    if (header.querySelector(".live-mode-select")) return;

    header.style.display = "flex";
    header.style.flexDirection = "row";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.gap = "10px";

    const rightBox = document.createElement("div");
    rightBox.className = "live-header-tools";
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "8px";

    const hint = document.createElement("div");
    hint.textContent = "LIVE";
    hint.style.fontSize = "11px";
    hint.style.fontWeight = "900";
    hint.style.opacity = "0.55";
    hint.style.letterSpacing = "0.6px";

    const sel = document.createElement("select");
    sel.className = "live-mode-select";
    sel.innerHTML = `
      <option value="SAVED">Saved</option>
      <option value="ALL">All</option>
    `;
    sel.value = mode;

    sel.style.height = "28px";
    sel.style.padding = "0 10px";
    sel.style.borderRadius = "10px";
    sel.style.border = "1px solid var(--line-soft)";
    sel.style.background = "color-mix(in srgb, var(--panel) 88%, transparent)";
    sel.style.color = "#fff";
    sel.style.fontWeight = "800";
    sel.style.fontSize = "12px";
    sel.style.outline = "none";

    sel.addEventListener("change", () => setMode(sel.value));

    rightBox.appendChild(hint);
    rightBox.appendChild(sel);
    header.appendChild(rightBox);
  }

  // -------------------------------------------------------
  // FT short-retention (2 minutes)
  // -------------------------------------------------------
  const FT_KEEP_MS = 120 * 1000;
  const ftSeenAt = new Map(); // matchId -> timestamp first seen as FT

  function filterWithFTRetention(matches) {
    const now = Date.now();

    const live = [];
    const ft = [];

    for (const m of matches) {
      const st = normalizeStatus(m);

      if (st === "LIVE") {
        live.push(m);
        const id = String(m?.id ?? "");
        if (id) ftSeenAt.delete(id);
        continue;
      }

      if (st === "FT") {
        const id = String(m?.id ?? "");
        if (!id) continue;

        if (!ftSeenAt.has(id)) ftSeenAt.set(id, now);

        const age = now - ftSeenAt.get(id);
        if (age <= FT_KEEP_MS) ft.push(m);
      }
    }

    for (const [id, t] of ftSeenAt.entries()) {
      if ((now - t) > (FT_KEEP_MS + 30000)) ftSeenAt.delete(id);
    }

    return { live, ft };
  }

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  let lastPayload = null;
  let lastRenderedKey = "";
  let lastRenderAt = 0;

  function buildRenderKey(allMatches, savedIds) {
    const ids = (allMatches || []).map((m) => String(m?.id ?? "")).join("|");
    const s = Array.from(savedIds).join("|");
    return mode + "@" + ids + "@" + s;
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------
  function hardClearPlaceholders() {
    panel.querySelectorAll(".panel-placeholder").forEach((el) => el.remove());
  }

  function render(allMatches) {
    ensureHeaderDropdown();
    hardClearPlaceholders();
    body.innerHTML = "";

    if (!allMatches || !Array.isArray(allMatches)) {
      body.innerHTML = '<div class="panel-placeholder">Waiting for live data...</div>';
      return;
    }

    const { live, ft } = filterWithFTRetention(allMatches);
    const combined = live.concat(ft);

    if (combined.length === 0) {
      body.innerHTML = '<div class="panel-placeholder">No live matches.</div>';
      return;
    }

    const savedIds = getSavedIds();
    const filtered =
      mode === "SAVED"
        ? combined.filter((m) => savedIds.has(String(m?.id ?? "")))
        : combined;

    if (filtered.length === 0) {
      body.innerHTML = '<div class="panel-placeholder">No saved live matches.</div>';
      return;
    }

    const grouped = groupByLeague(filtered);

    for (const [league, list] of grouped.entries()) {
      const block = document.createElement("div");
      block.className = "league-block";

      const leagueTitle = document.createElement("div");
      leagueTitle.className = "league-title";
      leagueTitle.textContent = league;

      block.appendChild(leagueTitle);

      list.forEach((m) => {
        const row = document.createElement("div");
        row.className = "match-row live-row";
        row.setAttribute("data-match-id", String(m?.id ?? ""));

        const teams = esc((m.home || "") + " – " + (m.away || ""));
        const metaRight = esc((formatMinute(m) + " " + formatScore(m)).trim());

        const isSaved = savedIds.has(String(m?.id ?? ""));
        const isFT = normalizeStatus(m) === "FT";

        row.innerHTML =
          '<div class="teams" style="display:flex;align-items:center;gap:8px;">' +
            (isFT ? '<span style="font-size:11px;font-weight:900;opacity:.55;">FT</span>' : "") +
            "<span>" + teams + "</span>" +
          "</div>" +
          '<div class="meta" style="display:flex;align-items:center;gap:10px;white-space:nowrap;">' +
            '<span class="live-meta-right" style="font-weight:900;opacity:.85;">' + metaRight + "</span>" +
            '<button class="live-save-btn" title="Save" style="' +
              "border:1px solid var(--line-soft);" +
              "border-radius:10px;" +
              "padding:4px 8px;" +
              "background:transparent;" +
              "color:#fff;" +
              "font-weight:900;" +
              "cursor:pointer;" +
            '">' + (isSaved ? "★" : "☆") + "</button>" +
          "</div>";

        row.addEventListener("click", () => {
          window.emit("match-selected", m);
          window.emit("active-match:set", m);
        });

        const btn = row.querySelector(".live-save-btn");
        if (btn) {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            window.emit("save-toggle", m);
          });
        }

        block.appendChild(row);
      });

      body.appendChild(block);
    }
  }

  function paint(force = false) {
    const allMatches =
      lastPayload && Array.isArray(lastPayload.matches)
        ? lastPayload.matches
        : null;

    const savedIds = getSavedIds();
    const key = buildRenderKey(allMatches || [], savedIds);

    const now = Date.now();
    const canTimeRefresh = (now - lastRenderAt) > 5000;
    if (!force && key === lastRenderedKey && !canTimeRefresh) return;

    lastRenderedKey = key;
    lastRenderAt = now;

    render(allMatches);
  }

  // -------------------------------------------------------
  // Events
  // -------------------------------------------------------
  window.on("live:update", function (payload) {
    lastPayload = payload || { matches: [] };
    paint(true);
  });

  window.on("saved:updated", function () {
    paint(true);
  });
  window.on("saved:changed", function () {
    paint(true);
  });

  // -------------------------------------------------------
  // Init
  // -------------------------------------------------------
  ensureHeaderDropdown();
  render(null);

  setInterval(() => {
    if (lastPayload && Array.isArray(lastPayload.matches)) paint(false);
  }, 3000);
})();
