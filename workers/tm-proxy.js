/**
 * tm-proxy.js — Cloudflare Worker: a thin Transfermarkt proxy.
 *
 * Transfermarkt serves our referee pages fine from residential IPs but blocks the
 * GitHub Actions datacenter range (403). Cloudflare's egress has a better IP
 * reputation, so the autonomous run (on GitHub) fetches TM THROUGH this worker.
 *
 * Usage:  GET https://<worker>/?path=/x/spieltag/wettbewerb/BRA1
 *         GET https://<worker>/?path=/x/schiedsrichter/wettbewerb/GB1/plus/?saison_id=2024
 * Returns the raw TM HTML (parsing stays in the Node source). Edge-cached ~30 min
 * since referee data changes slowly. Only transfermarkt.com paths are allowed.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.searchParams.get("path");

    if (!path || !path.startsWith("/")) {
      return new Response("missing or invalid ?path", { status: 400 });
    }

    const target = "https://www.transfermarkt.com" + path;

    // Serve from edge cache when possible.
    const cache = caches.default;
    const cacheKey = new Request(target, { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "referer": "https://www.transfermarkt.com/"
        },
        cf: { cacheTtl: 1800, cacheEverything: true }
      });
    } catch (e) {
      return new Response("upstream fetch failed: " + e.message, { status: 502 });
    }

    const body = await upstream.text();
    const res = new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=1800",
        "x-tm-status": String(upstream.status)
      }
    });
    if (upstream.ok) await cache.put(cacheKey, res.clone());
    return res;
  }
};
