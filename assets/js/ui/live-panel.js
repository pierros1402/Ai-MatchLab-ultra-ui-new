/* =========================================================
   AIMATCHLAB ULTRA — LIVE PANEL FINAL (PRODUCTION STABLE)
========================================================= */

/* ================= LIVE PANEL BOOT ================= */

(function () {

  function waitUntilReady() {
    const busReady =
      typeof window.on === "function" &&
      typeof window.emit === "function";

    const panel =
      document.querySelector(".intelligence-panel.live-panel");

    if (!busReady || !panel) {
      setTimeout(waitUntilReady, 100);
      return;
    }

    console.log("[LIVE PANEL] BOOT OK");
    initLivePanel(panel);
  }

  waitUntilReady();

})();

function initLivePanel(panel) {

  // ✅ PREVENT MULTIPLE INIT
  if (window.__LIVE_PANEL_LOADED__) {
    console.warn("[LIVE PANEL] already initialized");
    return;
  }
  window.__LIVE_PANEL_LOADED__ = true;

  console.log("[LIVE PANEL] ready");

  const body =
    panel.querySelector("#live-list") ||
    panel.querySelector(".panel-body") ||
    panel;

  /* ================= STATE ================= */

  const MEMORY   = new Map();
  const PRIORITY = new Map();
  const DANGER   = new Map();
  const ROWS     = new Map();
  const LEAGUES  = new Map();

  const BOOST_LIFETIME = 90000;

  const keyOf = m =>
    String(
      m.id ??
      m.matchId ??
      `${m.home || m.homeTeam}|${m.away || m.awayTeam}|${m.kickoff_ms || 0}`
    );

  /* ================= HELPERS ================= */

  const esc = s =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  function normalizeStatus(m) {
    return String(
      m?.status?.type?.state ??
      m?.status?.type?.name ??
      m?.status ??
      ""
    ).toUpperCase();
  }

  function isLiveStatus(st) {
    if (!st) return false;

    const s = String(st).toUpperCase();

    return (
      s === "LIVE" ||                 // 👈 ΠΡΟΣΘΗΚΗ
      s.includes("IN_PROGRESS") ||
      s.includes("LIVE") ||
      s.includes("FIRST_HALF") ||
      s.includes("SECOND_HALF") ||
      s.includes("HALF_TIME") ||
      s.includes("EXTRA_TIME")
    );
  }

  const formatScore = m =>
    (m.scoreHome == null || m.scoreAway == null)
      ? ""
      : `${m.scoreHome}-${m.scoreAway}`;

  const getLeagueName = m =>
    m.leagueName || m.leagueSlug || m.league || "SOCCER";

  /* ================= CLOCK ================= */

  function parseMinute(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(\d+)(?:\+(\d+))?/);
    if (!m) return null;

    const base = Number(m[1] || 0);
    if (!Number.isFinite(base)) return null;

    return base;
  }

  function minuteValue(m) {
    const key = keyOf(m);
    const mem = MEMORY.get(key);

    if (!mem) {
      return parseMinute(m.minute ?? m?.status?.displayClock) ?? 0;
    }

    const base = Number.isFinite(mem.base_minute) ? mem.base_minute : null;
    const start = Number.isFinite(mem.live_ts) ? mem.live_ts : null;

    if (base == null || start == null) {
      return parseMinute(m.minute ?? m?.status?.displayClock) ?? 0;
    }

    return base + Math.max(0, Math.floor((Date.now() - start) / 60000));
  }

  /* ================= INTELLIGENCE ================= */

  function detectDanger(m) {
    const minute = minuteValue(m);
    const diff = Math.abs((+m.scoreHome || 0) - (+m.scoreAway || 0));

    if (minute >= 70 && diff === 0) return 35;
    if (minute >= 75 && diff === 1) return 25;
    if (minute >= 85) return 20;

    return 0;
  }

  function priorityScore(m) {
    const key = keyOf(m);
    let score = minuteValue(m);
    const now = Date.now();

    const apply = (map) => {
      const entry = map.get(key);
      if (!entry) return;

      const age = now - entry.ts;
      if (age > BOOST_LIFETIME) {
        map.delete(key);
        return;
      }

      score += entry.boost * (1 - age / BOOST_LIFETIME);
    };

    apply(PRIORITY);
    apply(DANGER);

    return score;
  }

  function snapshot(m) {
    return {
      score: formatScore(m),
      minute: parseMinute(m.minute ?? m?.status?.displayClock)
    };
  }

  function visualClass(m) {
    const minute = minuteValue(m);
    const diff = Math.abs((+m.scoreHome || 0) - (+m.scoreAway || 0));

    if (minute >= 85) return "live-critical";
    if (minute >= 70 && diff === 0) return "live-danger";
    if (diff === 1 && minute >= 60) return "live-pressure";
    return "";
  }

  /* ================= DOM HELPERS ================= */

  function getLeagueBlock(name) {
    let block = LEAGUES.get(name);
    if (block) return block;

    block = document.createElement("div");
    block.className = "league-block";

    const title = document.createElement("div");
    title.className = "league-title";
    title.textContent = name;

    block.appendChild(title);
    body.appendChild(block);

    LEAGUES.set(name, block);
    return block;
  }

  function patchRow(row, m) {
    const key = keyOf(m);

    let mem = MEMORY.get(key);
    if (!mem) {
      mem = {};
      MEMORY.set(key, mem);
    }

    const rawMinute = String(m.minute ?? m?.status?.displayClock ?? "").trim();
    const base = parseMinute(rawMinute) ?? "";

    const status = normalizeStatus(m);
    const isSecondHalf =
      status.includes("SECOND_HALF") ||
      status.includes("SECOND") ||
      status.includes("2ND");

    const prevBase = Number.isFinite(mem.base_minute) ? mem.base_minute : null;

    // reset only when the actual phase/minute base changed
    if (
      prevBase == null ||
      base !== prevBase ||
      (isSecondHalf && !mem.is_second_half)
    ) {
      mem.live_ts = Date.now();
      mem.base_minute = base;
    }

    mem.is_second_half = isSecondHalf;
    MEMORY.set(key, mem);

    row.className = `match-row live-row ${visualClass(m)}`;

    const minuteNow = minuteValue(m);
    const minuteLabel =
      rawMinute && rawMinute.includes("+") && !isSecondHalf
        ? `${rawMinute}'`
        : (minuteNow ? `${minuteNow}'` : "");

    row.innerHTML = `
      <div class="teams">${esc(m.home || m.homeTeam)} – ${esc(m.away || m.awayTeam)}</div>
      <div class="meta">
        <span class="live-minute"
              data-key="${esc(key)}"
              data-base="${Number.isFinite(mem.base_minute) ? mem.base_minute : ""}"
              data-start="${Number.isFinite(mem.live_ts) ? mem.live_ts : ""}"
              data-raw="${esc(rawMinute)}"
              data-second-half="${isSecondHalf ? "1" : "0"}">${minuteLabel}</span>
        ${formatScore(m)}
      </div>
    `;
  }

  function render(matches) {
    if (!Array.isArray(matches)) return;

    const placeholder = panel.querySelector(".panel-placeholder");
    if (placeholder) placeholder.style.display = "none";

    const live = matches
      .filter(m => isLiveStatus(normalizeStatus(m)))
      .sort((a, b) => priorityScore(b) - priorityScore(a));

    if (live.length === 0) {
      body.innerHTML = `
        <div class="live-empty">
          <div class="live-empty-title">
            No matches live right now
          </div>
          <div class="live-empty-sub">
            Next kickoff monitoring active
          </div>
          <div class="live-empty-meta">
            AI tracking today's fixtures
          </div>
        </div>
      `;

      ROWS.clear();
      LEAGUES.clear();
      MEMORY.clear();
      PRIORITY.clear();
      DANGER.clear();
      return;
    }

    const nextKeys = new Set(live.map(keyOf));

    for (const [k, row] of ROWS) {
      if (!nextKeys.has(k)) {
        row.remove();
        ROWS.delete(k);
        MEMORY.delete(k);
        PRIORITY.delete(k);
        DANGER.delete(k);
      }
    }

    for (const m of live) {
      const key = keyOf(m);
      const mem = MEMORY.get(key) || {};
      const now = snapshot(m);

      const goalChanged = mem.score && mem.score !== now.score;
      if (goalChanged) {
        PRIORITY.set(key, { ts: Date.now(), boost: 50 });
      }

      const d = detectDanger(m);
      if (d > 0) {
        DANGER.set(key, { ts: Date.now(), boost: d });
      }

      mem.score = now.score;
      mem.minute = now.minute;
      MEMORY.set(key, mem);

      const league = getLeagueName(m);
      const block = getLeagueBlock(league);

      let row = ROWS.get(key);
      if (!row) {
        row = document.createElement("div");

        row.onclick = () => {
          window.emit("match-selected", m);
          window.emit("active-match:set", m);
        };

        ROWS.set(key, row);
        block.appendChild(row);
      } else if (row.parentNode !== block) {
        block.appendChild(row);
      }

      patchRow(row, m);

      if (goalChanged) {
        row.classList.add("updated");
        setTimeout(() => {
          row.classList.remove("updated");
        }, 1200);
      }
    }

    for (const [name, block] of LEAGUES) {
      const matchRows = block.querySelectorAll(".match-row");
      if (!matchRows.length) {
        block.remove();
        LEAGUES.delete(name);
      }
    }
  }

  /* ================= EVENTS ================= */

  let LAST_HASH = null;

  console.log("[LIVE PANEL] binding live:update listener");
  window.__AIML_LIVE_READY = true;
  window.__LIVE_RENDER = render;

  window.on("live:update", (payload) => {
    if (!payload) return;

    const matches = Array.isArray(payload.matches) ? payload.matches : [];

    if (!payload.date && matches.length === 0) return;

    if (payload.hash && payload.hash === LAST_HASH) return;
    LAST_HASH = payload.hash || null;

    render(matches);
  });

  /* ================= INSTANT BOOT ================= */

  function bootFromSnapshot() {
    const cached = window.__AIML_LAST_LIVE;
    if (!cached) return;

    LAST_HASH = cached.hash || null;
    render(cached.matches || []);
  }

  setTimeout(() => {
    bootFromSnapshot();
    setTimeout(bootFromSnapshot, 300);
  }, 0);

  /* ================= LIVE CLOCK ENGINE ================= */

  function updateLiveClocks() {
    const now = Date.now();

    document.querySelectorAll(".live-minute").forEach(el => {
      const base = Number(el.dataset.base);
      const start = Number(el.dataset.start);
      const raw = String(el.dataset.raw || "").trim();
      const isSecondHalf = el.dataset.secondHalf === "1";

      if (!Number.isFinite(base) || !Number.isFinite(start)) {
        if (raw) el.textContent = `${raw}'`;
        return;
      }

      // keep first-half stoppage exactly as received
      if (raw.includes("+") && !isSecondHalf) {
        el.textContent = `${raw}'`;
        return;
      }

      const elapsed = Math.floor((now - start) / 60000);
      el.textContent = `${base + Math.max(0, elapsed)}'`;
    });
  }

  setInterval(updateLiveClocks, 15000);
  updateLiveClocks();

  /* ================= SNAPSHOT REPLAY ================= */

  setTimeout(() => {
    if (window.__LIVE_REPLAY_DONE__) return;
    window.__LIVE_REPLAY_DONE__ = true;

    if (window.__AIML_LAST_LIVE) {
      console.log("[LIVE PANEL] replay snapshot");
      window.emit("live:update", window.__AIML_LAST_LIVE);
    }
  }, 50);
}