/**
 * AIMATCHLAB – LIVE ENGINE (API MODULE)
 * Migrated from standalone LIVE worker v1.4.1
 *
 * Route:
 *   GET /api/live
 *
 * Source:
 *   ESPN all scoreboard (no API key required)
 */

const VERSION = "2.0.0-api";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function safeJsonParse(str) {
  try { return JSON.parse(str); }
  catch { return null; }
}

function normalizeMinute(comp) {
  const clk = comp?.status?.displayClock;
  if (typeof clk === "string" && clk.trim()) return clk.trim();

  const c = comp?.status?.clock;
  if (typeof c === "number" && Number.isFinite(c)) {
    return `${Math.floor(c)}'`;
  }

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

  const res = await fetch(api, {
    cf: { cacheTtl: 20, cacheEverything: true }
  });

  const txt = await res.text();
  const j = safeJsonParse(txt);

  return {
    ok: res.ok,
    status: res.status,
    url: api,
    json: j
  };
}

function extractLiveMatches(scoreboardJson) {
  const events = Array.isArray(scoreboardJson?.events)
    ? scoreboardJson.events
    : [];

  const out = [];

  for (const ev of events) {
    const comp = Array.isArray(ev?.competitions)
      ? ev.competitions[0]
      : null;

    if (!comp) continue;

    const st = comp?.status?.type || {};
    const state = String(st?.state || "").toLowerCase(); // pre | in | post

    // Keep LIVE + FT
    if (state !== "in" && state !== "post") continue;

    const isLive = state === "in";
    const isFT   = state === "post";

    const competitors = Array.isArray(comp?.competitors)
      ? comp.competitors
      : [];

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
      league: leagueName,
      leagueName,
      leagueId,
      kickoff,
      status: isLive ? "LIVE" : "FT",
      completed: isFT,
      minute,
      scoreHome,
      scoreAway,
      provider: "ESPN",
      source: "espn-all"
    });
  }

  return out;
}

export async function handleLive(req, env) {
  const url = new URL(req.url);

  if (req.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

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

  return json({
    ok: true,
    version: VERSION,
    ts: new Date().toISOString(),
    source: "espn-all",
    matches,
    meta: {
      took_ms: Date.now() - t0,
      live_count: matches.filter(m => m.status === "LIVE").length,
      ft_count: matches.filter(m => m.status === "FT").length
    },
    debug
  });
}
