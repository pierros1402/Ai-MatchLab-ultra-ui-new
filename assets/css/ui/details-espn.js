/* ============================================================
   assets/js/ui/details-espn.js  (FINAL v1.6.0)
   Worker-backed Match Details data layer for AIML ULTRA

   Uses:
     - {base}/match-summary?league=<eng.1>&event=<id>
     - {base}/standings?league=<eng.1>

   Exposes:
     window.DetailsAPI.load(match) -> { ok, match, league, summary, standings, h2h? }
     window.DetailsAPI.extractStats(payload) -> [{name, home, away}]
     window.DetailsAPI.extractTimeline(payload) -> [{t, text, side}]
============================================================ */
(function () {
  "use strict";

  if (window.__AIML_DETAILS_API__) return;
  window.__AIML_DETAILS_API__ = true;

  const hasBus = typeof window.on === "function" && typeof window.emit === "function";
  if (!hasBus) return;

  const cfg = () => window.AIML_LIVE_CFG || {};
  const base = () => String(cfg().fixturesBase || cfg().liveUltraBase || "").replace(/\/+$/, "");

  const esc = (s) =>
    String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  // id -> espn slug fallback (only if leagueSlug missing)
  const ID_TO_SLUG = {
    ENG1: "eng.1", ENG2: "eng.2", ENG3: "eng.3", ENG4: "eng.4",
    ESP1: "esp.1", ESP2: "esp.2",
    GER1: "ger.1", GER2: "ger.2",
    ITA1: "ita.1", ITA2: "ita.2",
    FRA1: "fra.1", FRA2: "fra.2",
    GRE1: "gre.1",
    NED1: "ned.1", POR1: "por.1", SCO1: "sco.1", BEL1: "bel.1",
    TUR1: "tur.1", CYP1: "cyp.1", SUI1: "sui.1"
  };

  function leagueFromMatch(m) {
    const slug = String(m?.leagueSlug || m?.league || "").trim().toLowerCase();
    if (slug && slug.includes(".")) return slug;

    const lid = String(m?.leagueId || "").trim().toUpperCase();
    if (lid && ID_TO_SLUG[lid]) return ID_TO_SLUG[lid];

    // last fallback: try to see a dotted league inside any string
    const any = String(m?.leagueName || "").toLowerCase();
    if (any.includes("premier")) return "eng.1";
    if (any.includes("laliga") || any.includes("la liga")) return "esp.1";
    return "";
  }

  async function fetchJson(path, params, timeoutMs) {
    const b = base();
    if (!b) return null;

    const q = new URLSearchParams(params || {});
    q.set("v", String(Date.now())); // cache-bust always

    const url = `${b}${path}${path.includes("?") ? "&" : "?"}${q.toString()}`;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Number(timeoutMs) || 12000);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ac.signal });
      const txt = await r.text();
      try { return JSON.parse(txt); } catch (_) { return null; }
    } catch (_) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // Lightweight client cache (per match id)
  const cache = Object.create(null);

  async function load(match) {
    const id = String(match?.id || "").trim();
    if (!id) return { ok: false, error: "missing_match_id" };

    const league = leagueFromMatch(match);

    const key = `${league}|${id}`;
    const c = cache[key];
    if (c && (Date.now() - c.ts) < 30000) return c.data;

    const out = { ok: true, ts: new Date().toISOString(), match, league };

    // Summary is required
    const sum = league ? await fetchJson("/match-summary", { league, event: id }, 15000) : null;
    out.summary = sum;

    // Standings is best-effort
    const st = league ? await fetchJson("/standings", { league }, 15000) : null;
    out.standings = st;

    // Optional H2H (only if the worker exposes it; keep best-effort)
    const homeId = String(match?.homeId || "").trim();
    const awayId = String(match?.awayId || "").trim();
    if (league && homeId && awayId) {
      const h2h = await fetchJson("/espn/h2h", { league, homeId, awayId, limit: 10 }, 15000);
      out.h2h = h2h;
    } else {
      out.h2h = null;
    }

    cache[key] = { ts: Date.now(), data: out };
    return out;
  }

  // -----------------------------
  // Robust extraction helpers (works even if worker-normalized is thin)
  // -----------------------------
  function getSummaryRaw(payload) {
    const s = payload?.summary;
    if (!s) return null;
    if (s.summary) return s.summary;       // worker format
    if (s.data) return s.data;             // alternative
    return s;                              // already raw
  }

  function getNormalized(payload) {
    const s = payload?.summary;
    if (!s) return null;
    return s.normalized || s.norm || null;
  }

  function extractTeams(payload) {
    const N = getNormalized(payload) || {};
    const raw = getSummaryRaw(payload) || {};
    const comp = raw?.header?.competitions?.[0] || null;
    const comps = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const home = comps.find(c => c?.homeAway === "home") || null;
    const away = comps.find(c => c?.homeAway === "away") || null;

    const homeName = N?.home?.name || home?.team?.displayName || home?.team?.name || payload?.match?.home || "";
    const awayName = N?.away?.name || away?.team?.displayName || away?.team?.name || payload?.match?.away || "";
    const homeScore = (N?.home?.score != null && String(N.home.score) !== "") ? String(N.home.score) : (home?.score != null ? String(home.score) : "");
    const awayScore = (N?.away?.score != null && String(N.away.score) !== "") ? String(N.away.score) : (away?.score != null ? String(away.score) : "");

    const kickoff_ms = Number(N?.kickoff_ms || payload?.match?.kickoff_ms || 0) || 0;
    const status = String(N?.status || payload?.match?.status || "") || "";
    const clock = String(N?.clock || payload?.match?.minute || "") || "";
    const venue = String(N?.venue || raw?.gameInfo?.venue?.fullName || "") || "";

    return { homeName, awayName, homeScore, awayScore, kickoff_ms, status, clock, venue };
  }

  function extractStats(payload) {
    const N = getNormalized(payload) || {};
    const raw = getSummaryRaw(payload) || {};

    // 1) worker normalized list (if present and already home/away)
    if (Array.isArray(N.statistics) && N.statistics.length) {
      // Accept either {name,homeDisplayValue,awayDisplayValue} or {name,homeValue,awayValue}
      return N.statistics.map(s => ({
        name: String(s?.name || s?.abbreviation || ""),
        home: String(s?.homeDisplayValue ?? s?.homeValue ?? s?.home ?? ""),
        away: String(s?.awayDisplayValue ?? s?.awayValue ?? s?.away ?? "")
      })).filter(x => x.name);
    }

    // 2) ESPN boxscore shape for soccer: boxscore.teams[].statistics[]
    const teams = Array.isArray(raw?.boxscore?.teams) ? raw.boxscore.teams : [];
    if (teams.length >= 2) {
      const a = teams[0], b = teams[1];
      const sa = Array.isArray(a?.statistics) ? a.statistics : [];
      const sb = Array.isArray(b?.statistics) ? b.statistics : [];

      const mapA = Object.create(null);
      for (const s of sa) {
        const key = String(s?.name || s?.abbreviation || "").trim();
        if (!key) continue;
        mapA[key] = s;
      }

      const out = [];
      for (const s of sb) {
        const key = String(s?.name || s?.abbreviation || "").trim();
        if (!key) continue;
        const sa0 = mapA[key];
        const home = sa0?.displayValue ?? sa0?.value ?? "";
        const away = s?.displayValue ?? s?.value ?? "";
        out.push({ name: key, home: String(home), away: String(away) });
      }

      // If empty due to mismatch, fall back to whichever exists
      if (out.length) return out;
    }

    // 3) last-resort: competition.statistics (rare)
    const comp = raw?.header?.competitions?.[0];
    const cstats = Array.isArray(comp?.statistics) ? comp.statistics : [];
    if (cstats.length) {
      return cstats.map(s => ({
        name: String(s?.name || s?.abbreviation || ""),
        home: String(s?.homeDisplayValue ?? s?.homeValue ?? ""),
        away: String(s?.awayDisplayValue ?? s?.awayValue ?? "")
      })).filter(x => x.name);
    }

    return [];
  }

  function extractTimeline(payload) {
    const N = getNormalized(payload) || {};
    const raw = getSummaryRaw(payload) || {};

    // ESPN often provides "details" array (play-by-play style)
    const details = Array.isArray(N.details) ? N.details
      : (Array.isArray(raw?.details) ? raw.details : []);

    const out = [];
    for (const d of details.slice(0, 50)) {
      const t = String(d?.clock?.displayValue || d?.clock || d?.time || d?.displayClock || "");
      const text = String(d?.text || d?.shortText || d?.description || "");
      const side = String(d?.team?.id || d?.teamId || "");
      if (!text) continue;
      out.push({ t, text, side });
    }
    return out;
  }

  // expose
  window.DetailsAPI = {
    load,
    esc,
    extractTeams,
    extractStats,
    extractTimeline
  };
})();