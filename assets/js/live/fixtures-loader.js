/* ============================================================
   js/live/fixtures-loader.js (STABLE v3.3 UNIFIED EVENTS)
   - Fixes:
       * active panel now auto-refreshes
       * live panel no longer regresses minutes easily
       * live payload merged against previous live snapshot
       * today / active / live snapshots kept in sync
   - Emits:
       "today-matches:loaded"
       "active-leagues:updated"
       "live:update"
   - Stores:
       window.__AIML_LAST_TODAY
       window.__AIML_LAST_ACTIVE
       window.__AIML_LAST_LIVE
============================================================ */

const LIVE_DEBUG = false;

function liveLog(...args)  { if (LIVE_DEBUG) console.log(...args); }
function liveWarn(...args) { if (LIVE_DEBUG) console.warn(...args); }

(function () {
  "use strict";

  function nowTs() {
    return Date.now();
  }

  function getBaseUrl() {
    const host = String(window.location?.hostname || "").toLowerCase();
    const isLocalHost =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1";

    const cfgBase =
      window.AIML_CONFIG &&
      typeof window.AIML_CONFIG.BASE_URL === "string"
        ? window.AIML_CONFIG.BASE_URL.trim()
        : "";

    const liveCfgBase =
      window.AIML_LIVE_CFG &&
      typeof window.AIML_LIVE_CFG.fixturesBase === "string"
        ? window.AIML_LIVE_CFG.fixturesBase.trim()
        : "";

    if (isLocalHost && liveCfgBase) {
      return liveCfgBase.replace(/\/+$/, "");
    }

    if (cfgBase) {
      return cfgBase.replace(/\/+$/, "");
    }

    if (liveCfgBase && !liveCfgBase.includes("localhost:3010")) {
      return liveCfgBase.replace(/\/+$/, "");
    }

    return isLocalHost
      ? "http://localhost:3010"
      : "https://ai-matchlab-engine.onrender.com";
  }

  async function fetchJson(url) {
    const r = await fetch(url, { method: "GET", cache: "no-store" });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${r.statusText} :: ${t.slice(0, 200)}`);
    }

    return await r.json();
  }

  function safeArray(x) {
    return Array.isArray(x) ? x : [];
  }

  function todayISO() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const y = parts.find(p => p.type === "year")?.value;
      const m = parts.find(p => p.type === "month")?.value;
      const d = parts.find(p => p.type === "day")?.value;

      return `${y}-${m}-${d}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function normalizeStatus(m) {
    const parts = [
      m?.status?.type?.state,
      m?.status?.type?.name,
      m?.status,
      m?.rawStatus,
      m?.statusType,
      m?.statusName,
      m?.state,
      m?.phase,
      m?.live === true || m?.isLive === true ? "LIVE" : ""
    ];

    return parts
      .filter(Boolean)
      .map(x => String(x).toUpperCase())
      .join(" ");
  }

  function isStaleLiveMatch(m) {
    const status = normalizeStatus(m);

    return (
      m?.staleLive === true ||
      String(m?.statusType || "").toUpperCase() === "STALE_LIVE" ||
      String(m?.status || "").toUpperCase() === "STALE_LIVE" ||
      status.includes("STALE_LIVE")
    );
  }

  function isLiveStatus(m) {
    if (isStaleLiveMatch(m)) return false;

    const s = normalizeStatus(m);

    return (
      s.includes("LIVE") ||
      s.includes("IN_PROGRESS") ||
      s.includes("FIRST_HALF") ||
      s.includes("SECOND_HALF") ||
      s.includes("HALF_TIME") ||
      s.includes("EXTRA_TIME") ||
      s.includes("FIRST") ||
      s.includes("SECOND") ||
      s.includes("HALF") ||
      s.includes("EXTRA") ||
      s.includes("PROGRESS")
    );
  }

  function parseMinute(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^(\d+)(?:\+(\d+))?/);
    if (!m) return null;

    const base = Number(m[1] || 0);
    const extra = Number(m[2] || 0);

    if (!Number.isFinite(base) || !Number.isFinite(extra)) return null;
    return base + extra;
  }

  function matchKey(m) {
    return String(
      m?.id ??
      m?.matchId ??
      `${m?.home || m?.homeTeam || ""}|${m?.away || m?.awayTeam || ""}|${m?.kickoff_ms || 0}`
    );
  }

  function mergeMatchStable(prev, next) {
    if (!prev) return next;

    const prevMinuteRaw = prev?.minute ?? prev?.status?.displayClock ?? "";
    const nextMinuteRaw = next?.minute ?? next?.status?.displayClock ?? "";

    const prevMinute = parseMinute(prevMinuteRaw);
    const nextMinute = parseMinute(nextMinuteRaw);

    const prevStatus = normalizeStatus(prev);
    const nextStatus = normalizeStatus(next);

    const prevIsLive = isLiveStatus(prev);
    const nextIsLive = isLiveStatus(next);

    const merged = { ...prev, ...next };

    // protect against minute regression while still live
    if (
      prevIsLive &&
      nextIsLive &&
      prevMinute != null &&
      nextMinute != null &&
      nextMinute < prevMinute &&
      !nextStatus.includes("HALF_TIME")
    ) {
      merged.minute = prev.minute;
      if (prev.status?.displayClock && typeof merged.status === "object" && merged.status) {
        merged.status = {
          ...merged.status,
          displayClock: prev.status.displayClock
        };
      }
    }

    // protect score if new payload is poorer/null
    if (next.scoreHome == null && prev.scoreHome != null) {
      merged.scoreHome = prev.scoreHome;
    }
    if (next.scoreAway == null && prev.scoreAway != null) {
      merged.scoreAway = prev.scoreAway;
    }

    return merged;
  }

  function mergeStableMatches(prevMatches, nextMatches) {
    const prevMap = new Map(
      safeArray(prevMatches).map(m => [matchKey(m), m])
    );

    return safeArray(nextMatches).map(next => {
      const key = matchKey(next);
      const prev = prevMap.get(key);
      return mergeMatchStable(prev, next);
    });
  }

  function buildHash(matches) {
    try {
      return JSON.stringify(
        safeArray(matches).map(m => ({
          id: matchKey(m),
          st: normalizeStatus(m),
          min: m?.minute ?? m?.status?.displayClock ?? "",
          sh: m?.scoreHome ?? null,
          sa: m?.scoreAway ?? null
        }))
      );
    } catch {
      return String(Date.now());
    }
  }

  const loadTodaySafe  = d => loadToday(d || todayISO());
  const loadActiveSafe = d => loadActive(d || todayISO());
  const loadLiveSafe   = d => loadLive(d || todayISO());

  async function loadToday(dateYmd) {
    const base = getBaseUrl();

    const url =
      `${base}/fixtures-runtime?mode=today&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}&nocache=${Math.random()}`;

    const data = await fetchJson(url);
    const matches = safeArray(data.matches);

    const mergedMatches = mergeStableMatches(
      window.__AIML_LAST_TODAY?.matches,
      matches
    );

    const payload = {
      date: data.date || dateYmd,
      matches: mergedMatches,
      total: Number.isFinite(data.count)
        ? data.count
        : mergedMatches.length,
      hash: buildHash(mergedMatches)
    };

    window.__AIML_LAST_TODAY = payload;

    document.dispatchEvent(
      new CustomEvent("today-matches:loaded", { detail: payload })
    );

    liveLog("[TODAY] loaded", payload.total);
    return payload;
  }

async function loadActive(dateYmd) {
  const base = getBaseUrl();

  const url =
    `${base}/fixtures-runtime?mode=active&date=${encodeURIComponent(dateYmd)}&_t=${nowTs()}&nocache=${Math.random()}`;

  const data = await fetchJson(url);
  const matches = safeArray(data.matches);

  const mergedMatches = mergeStableMatches(
    window.__AIML_LAST_ACTIVE?.matches,
    matches
  );

  const payload = {
    date: data.date || dateYmd,
    matches: mergedMatches,
    total: Number.isFinite(data.count)
      ? data.count
      : mergedMatches.length,
    hash: buildHash(mergedMatches)
  };

  window.__AIML_LAST_ACTIVE = payload;

  document.dispatchEvent(
    new CustomEvent("active-leagues:updated", { detail: payload })
  );

  liveLog("[ACTIVE] loaded", payload.total);
  return payload;
}

async function loadLive(dateYmd) {
  const ymd =
    (typeof dateYmd === "string" && dateYmd.length >= 10)
      ? dateYmd.slice(0, 10)
      : todayISO();

  if (!dateYmd) {
    liveWarn("[LIVE] loadLive called with empty dateYmd -> using", ymd);
  }

  try {
    const base = getBaseUrl();

    const url =
      `${base}/fixtures-runtime?mode=today&date=${encodeURIComponent(ymd)}&_t=${nowTs()}&nocache=${Math.random()}`;

    const data = await fetchJson(url);
    const matches = safeArray(data.matches);

    const liveMatches = matches.filter(m => {
      if (isStaleLiveMatch(m)) return false;
      const s = String(
        m?.status?.type?.name ||
        m?.status?.type?.state ||
        m?.status ||
        ""
      ).toUpperCase();

      return (
        s.includes("LIVE") ||
        s.includes("IN_PROGRESS") ||
        s.includes("FIRST_HALF") ||
        s.includes("SECOND_HALF") ||
        s.includes("HALF_TIME") ||
        s.includes("EXTRA_TIME") ||
        s.includes("FIRST") ||
        s.includes("SECOND") ||
        s.includes("HALF") ||
        s.includes("EXTRA") ||
        s.includes("PROGRESS")
      );
    });

    const mergedLiveMatches = mergeStableMatches(
      window.__AIML_LAST_LIVE?.matches,
      liveMatches
    );

    const payload = {
      date: ymd,
      matches: mergedLiveMatches,
      total: mergedLiveMatches.length,
      hash: buildHash(mergedLiveMatches)
    };

    window.__AIML_LAST_LIVE = payload;

    if (typeof window.emit === "function") {
      window.emit("live:update", payload);
    }

    liveLog("[LIVE] today-derived snapshot", mergedLiveMatches.length);
    return payload;

  } catch (err) {
    console.warn("[LIVE] today snapshot failed", err);

    const payload = {
      date: ymd,
      matches: safeArray(window.__AIML_LAST_LIVE?.matches),
      total: safeArray(window.__AIML_LAST_LIVE?.matches).length,
      hash: buildHash(window.__AIML_LAST_LIVE?.matches || [])
    };

    window.__AIML_LAST_LIVE = payload;

    if (typeof window.emit === "function") {
      window.emit("live:update", payload);
    }

    return payload;
  }
}
  window.AIML_FixturesLoader = window.AIML_FixturesLoader || {};
  window.AIML_FixturesLoader.loadToday = loadTodaySafe;
  window.AIML_FixturesLoader.loadActive = loadActiveSafe;
  window.AIML_FixturesLoader.loadLive = loadLiveSafe;

  window.loadTodayFixtures = loadTodaySafe;
  window.loadActiveFixtures = loadActiveSafe;
  window.loadLiveFixtures = loadLiveSafe;

(function startUnifiedLoop() {

  async function tick() {
    try {
      const day = todayISO();

      // 1. LOAD ACTIVE FIRST (most complete)
      const active = await loadActive(day);

      // 2. LOAD TODAY SEPARATELY (CORRECT)
      const today = await loadToday(day);

      // 3. LIVE from TODAY
      const liveMatches = today.matches.filter(m => {
        if (isStaleLiveMatch(m)) return false;
        const s = String(
          m?.status?.type?.name ||
          m?.status?.type?.state ||
          m?.status ||
          ""
        ).toUpperCase();

        return (
          s.includes("LIVE") ||
          s.includes("IN_PROGRESS") ||
          s.includes("FIRST_HALF") ||
          s.includes("SECOND_HALF") ||
          s.includes("HALF_TIME") ||
          s.includes("EXTRA_TIME")
        );
      });

      const livePayload = {
        date: today.date,
        matches: liveMatches,
        total: liveMatches.length,
        hash: buildHash(liveMatches)
      };

      window.__AIML_LAST_LIVE = livePayload;

      if (typeof window.emit === "function") {
        window.emit("live:update", livePayload);
      }

    } catch (e) {
      console.warn("[unified-loop]", e);
    }
  }

  tick();
  setInterval(tick, 15000);

})();
  (function startDayWatcher() {
    let currentDay = todayISO();

    setInterval(async () => {
      const nowDay = todayISO();

      if (nowDay !== currentDay) {
        console.log("[DAY CHANGE]", currentDay, "→", nowDay);
        currentDay = nowDay;

        try {
          await loadToday(nowDay);
          await loadActive(nowDay);
          await loadLive(nowDay);
        } catch (e) {
          console.warn("[DAY CHANGE] reload failed", e);
        }
      }
    }, 30000);
  })();

})();