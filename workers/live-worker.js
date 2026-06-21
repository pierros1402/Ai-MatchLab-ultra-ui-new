/**
 * live-worker.js — Cloudflare Worker: live scores proxy (NO deploys to refresh).
 *
 * The today/live panels poll this for live scores/status. It fetches the
 * Flashscore feed on demand and edge-caches it briefly, so live data stays fresh
 * without ever redeploying the engine/UI. Match ids returned are `fs_<id>` — the
 * SAME ids our fixtures snapshot uses, so the panels can overlay directly with no
 * mapping.
 *
 *   GET /api/live            → { ok, ts, count, matches:[{matchId,home,away,
 *                               scoreHome,scoreAway,status,statusCode}] }
 *   GET /health
 *
 * Deploy: `wrangler deploy` (see workers/wrangler.live.toml), or paste into the
 * Cloudflare dashboard. CACHE_TTL keeps upstream calls low on the free plan.
 */

const FSIGN = "SW9D1eZo";
const FEED = "https://2.flashscore.ninja/2/x/feed/f_1_0_3_en_1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const CACHE_TTL = 30; // seconds

const LIVE_WINDOW_SEC = 3.5 * 3600; // a match can't be "live" longer than this

// Robust status: never let an old/finished match linger as LIVE. AB=3 is the
// reliable finished flag; AB=1 / no score is scheduled; in-play only if it has a
// score, isn't finished, and kicked off recently. Unknown codes (postponed,
// abandoned, after-ET, feed lag) fall through to FT/PRE — NOT LIVE.
function mapStatus(ab, hasScore, kickoffSec, nowSec) {
  if (ab === "3") return "FT";
  if (ab === "1" || !hasScore) return "PRE";
  if (kickoffSec && nowSec - kickoffSec > LIVE_WINDOW_SEC) return "FT"; // too old to be live
  if (ab === "2") return "LIVE";          // in-play
  return hasScore ? "FT" : "PRE";         // any other code with a score = finished
}

// Approximate live minute from kickoff (the feed has no clean minute field).
// Crude HT handling: clamp around 45' and subtract the ~15' break in 2nd half.
function liveMinute(kickoffSec, nowSec) {
  if (!kickoffSec) return null;
  let el = Math.floor((nowSec - kickoffSec) / 60);
  if (el < 0) return null;
  if (el > 60) el -= 15;
  else if (el > 45) el = 45;
  return Math.max(1, Math.min(el, 130));
}

function cleanLeague(za) {
  const i = String(za || "").indexOf(":");
  return i >= 0 ? za.slice(i + 1).trim() : String(za || "").trim();
}

function parseFeed(text) {
  const out = [];
  const nowSec = Date.now() / 1000;
  let league = null;
  for (const rec of String(text || "").split("~")) {
    const f = {};
    for (const kv of rec.split("¬")) {
      const i = kv.indexOf("÷");
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    }
    if (f.ZA) league = cleanLeague(f.ZA);
    if (!f.AA || !f.AE || !f.AF) continue;
    const sh = f.AG !== undefined && f.AG !== "" ? Number(f.AG) : null;
    const sa = f.AH !== undefined && f.AH !== "" ? Number(f.AH) : null;
    const hasScore = Number.isFinite(sh) && Number.isFinite(sa);
    const ko = Number(f.AD);
    const koSec = Number.isFinite(ko) ? ko : null;
    const status = mapStatus(f.AB, hasScore, koSec, nowSec);
    out.push({
      matchId: `fs_${f.AA}`,
      home: f.AE,
      away: f.AF,
      leagueName: league,
      scoreHome: Number.isFinite(sh) ? sh : null,
      scoreAway: Number.isFinite(sa) ? sa : null,
      statusCode: f.AB || null,
      status,
      minute: status === "LIVE" ? liveMinute(koSec, nowSec) : null,
      kickoffUtc: koSec ? new Date(koSec * 1000).toISOString() : null
    });
  }
  return out;
}

function cors(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    ...extra
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "live-worker" }), { headers: cors() });
    }

    if (url.pathname !== "/api/live") {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: cors() });
    }

    // Edge cache: serve a cached response for CACHE_TTL to bound upstream calls.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let matches = [];
    try {
      const res = await fetch(FEED, { headers: { "x-fsign": FSIGN, "user-agent": UA, "referer": "https://www.flashscore.com/" } });
      if (res.ok) matches = parseFeed(await res.text());
    } catch (_) { /* return empty on upstream failure */ }

    const body = JSON.stringify({ ok: true, ts: Date.now(), count: matches.length, matches });
    const response = new Response(body, {
      headers: cors({ "cache-control": `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}` })
    });

    // Store in edge cache (clone, since the body is consumed once).
    try { await cache.put(cacheKey, response.clone()); } catch (_) {}
    return response;
  }
};
