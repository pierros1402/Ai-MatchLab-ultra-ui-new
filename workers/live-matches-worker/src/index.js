/**
 * AI MATCHLAB LIVE MATCHES WORKER v1.4.1
 * ESPN global live feed via soccer/all/scoreboard (no keys)
 *
 * Endpoint:
 *   GET /api/unified-live
 *
 * Notes:
 * - Pulls from https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard
 * - Returns LIVE matches AND recently finished (FT)
 * - CORS-safe
 */

const VERSION = "1.4.1";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json",
  };
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function normalizeMinute(comp) {
  const clk = comp?.status?.displayClock;
  if (typeof clk === "string" && clk.trim()) return clk.trim();
  const c = comp?.status?.clock;
  if (typeof c === "number" && Number.isFinite(c)) return `${Math.floor(c)}'`;
  return "";
}

function pickTeam(competitors, side) {
  const arr = Array.isArray(competitors) ? competitors : [];
  const bySide = arr.find((c) => (c?.homeAway || "").toLowerCase() === side);
  return bySide || arr[side === "home" ? 0 : 1] || null;
}

function leagueFromUid(uid) {
  const m = typeof uid === "string" ? uid.match(/~l:(\d+)/) : null;
  return m ? `L:${m[1]}` : "";
}

function leagueNameGuess(ev, comp) {
  const lid = leagueFromUid(comp?.uid || ev?.uid);
  const slug = ev?.season?.slug || comp?.season?.slug || "";
  return slug || lid || "SOCCER";
}

async function fetchEspnAllScoreboard() {
  const api = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";
  const res = await fetch(api, { cf: { cacheTtl: 20, cacheEverything: true } });
  const txt = await res.text();
  const j = safeJsonParse(txt);
  return { ok: res.ok, status: res.status, url: api, json: j };
}

function extractLiveMatches(scoreboardJson) {
  const events = Array.isArray(scoreboardJson?.events) ? scoreboardJson.events : [];
  const out = [];

  for (const ev of events) {
    const comp = Array.isArray(ev?.competitions) ? ev.competitions[0] : null;
    if (!comp) continue;

    const st = comp?.status?.type || {};
    const state = String(st?.state || "").toLowerCase(); // pre | in | post

    // ✅ ΚΡΑΤΑΜΕ LIVE ΚΑΙ FT
    if (state !== "in" && state !== "post") continue;

    const isLive = state === "in";
    const isFT   = state === "post";

    const competitors = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const homeObj = pickTeam(competitors, "home");
    const awayObj = pickTeam(competitors, "away");

    const home = homeObj?.team?.displayName || homeObj?.team?.name || "";
    const away = awayObj?.team?.displayName || awayObj?.team?.name || "";
    if (!home || !away) continue;

    const scoreHome = homeObj?.score ?? "";
    const scoreAway = awayObj?.score ?? "";

    const kickoff = comp?.startDate || comp?.date || ev?.date || "";
    const minute = isFT ? null : normalizeMinute(comp);

    const leagueName = leagueNameGuess(ev, comp);
    const leagueId = leagueFromUid(comp?.uid || ev?.uid);

    out.push({
      id: String(ev?.id || comp?.id || `${leagueId}:${home}-${away}:${kickoff}`),
      home,
      away,
      title: `${home} - ${away}`,
      league: leagueName,      // backward compatibility
      leagueName: leagueName,
      leagueId: leagueId,
      kickoff,
      status: isLive ? "LIVE" : "FT",
      completed: isFT,
      minute,
      scoreHome,
      scoreAway,
      provider: "ESPN",
      source: "espn-all",
    });
  }

  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (pathname === "/") {
      return new Response(
        JSON.stringify({
          ok: true,
          version: VERSION,
          ts: new Date().toISOString(),
          msg: "LIVE worker online",
        }),
        { status: 200, headers: corsHeaders() }
      );
    }

    if (pathname.startsWith("/api/unified-live")) {
      const t0 = Date.now();
      let debug = {};
      let matches = [];

      try {
        const r = await fetchEspnAllScoreboard();
        debug = { ok: r.ok, status: r.status, url: r.url };
        if (r.ok && r.json) {
          matches = extractLiveMatches(r.json);
        } else {
          debug.error = "scoreboard_fetch_failed";
        }
      } catch (e) {
        debug = { ok: false, error: e?.message || String(e) };
      }

      const payload = {
        ok: true,
        version: VERSION,
        ts: new Date().toISOString(),
        source: "espn-all",
        matches,
        meta: {
          took_ms: Date.now() - t0,
          live_count: matches.filter(m => m.status === "LIVE").length,
          ft_count: matches.filter(m => m.status === "FT").length,
        },
        debug,
      };

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: corsHeaders(),
      });
    }

    return new Response(
      JSON.stringify({ ok: false, version: VERSION, msg: "Not Found" }),
      { status: 404, headers: corsHeaders() }
    );
  },
};
