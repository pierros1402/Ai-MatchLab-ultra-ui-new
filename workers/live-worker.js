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

function statusFromCode(ab) {
  // Flashscore: 1 = scheduled, 3 = finished, anything else = live (HT/1H/2H/ET…).
  if (ab === "1") return "PRE";
  if (ab === "3") return "FT";
  return "LIVE";
}

function parseFeed(text) {
  const out = [];
  for (const rec of String(text || "").split("~")) {
    const f = {};
    for (const kv of rec.split("¬")) {
      const i = kv.indexOf("÷");
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    }
    if (!f.AA || !f.AE || !f.AF) continue;
    const sh = f.AG !== undefined && f.AG !== "" ? Number(f.AG) : null;
    const sa = f.AH !== undefined && f.AH !== "" ? Number(f.AH) : null;
    out.push({
      matchId: `fs_${f.AA}`,
      home: f.AE,
      away: f.AF,
      scoreHome: Number.isFinite(sh) ? sh : null,
      scoreAway: Number.isFinite(sa) ? sa : null,
      statusCode: f.AB || null,
      status: statusFromCode(f.AB)
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
