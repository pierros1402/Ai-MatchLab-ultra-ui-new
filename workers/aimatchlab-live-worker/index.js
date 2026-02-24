export default {
  async fetch(req, env, ctx) {

    // --------------------------------
    // CORS PREFLIGHT
    // --------------------------------
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // --------------------------------
    // EDGE CACHE (15s)
    // --------------------------------
    const cache = caches.default;
    const cacheKey = new Request(req.url, req);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // --------------------------------
    // ESPN LIVE FETCH (PARALLEL)
    // --------------------------------
    const leagues = ["eng.1","ita.1","esp.1","ger.1","fra.1"];

    const BASE =
      "https://site.api.espn.com/apis/site/v2/sports/soccer";

    const responses = await Promise.all(
      leagues.map(lg =>
        fetch(`${BASE}/${lg}/scoreboard`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );

    const allMatches = [];

    for (const json of responses) {

      if (!json) continue;

      const events = json?.events || [];

      for (const e of events) {

        const comp = e?.competitions?.[0];
        if (!comp) continue;

        const status =
          comp.status?.type?.state ||
          comp.status?.type?.name ||
          "";

        const s = String(status).toUpperCase();

        // LIVE STATES ONLY
        const isLive =
          s.includes("IN") ||
          s.includes("PROGRESS") ||
          s.includes("HALF");

        if (!isLive) continue;

        const home = comp.competitors?.find(c => c.homeAway === "home");
        const away = comp.competitors?.find(c => c.homeAway === "away");

        allMatches.push({
          id: e.id,
          home: home?.team?.displayName ?? "",
          away: away?.team?.displayName ?? "",
          scoreHome: Number(home?.score ?? 0),
          scoreAway: Number(away?.score ?? 0),
          status: comp.status?.type?.state ?? "",
          minute: comp.status?.displayClock ?? "",
          leagueName: json?.leagues?.[0]?.name ?? ""
        });
      }
    }

    // --------------------------------
    // STABLE SORT (latest minute first)
    // --------------------------------
    allMatches.sort((a, b) => {
      const ma = parseMinute(a.minute);
      const mb = parseMinute(b.minute);
      return mb - ma;
    });

    // --------------------------------
    // CHANGE HASH (ANTI REDRAW)
    // --------------------------------
    const hash = buildHash(allMatches);

    // --------------------------------
    // RESPONSE
    // --------------------------------
    const response = new Response(
      JSON.stringify({
        ts: Date.now(),
        hash,
        matches: allMatches
      }),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=15",
          ...corsHeaders()
        }
      }
    );

    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  }
};


// ============================================================
// HELPERS
// ============================================================

function parseMinute(min) {
  if (!min) return 0;
  const n = parseInt(String(min).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function buildHash(matches) {
  return matches
    .map(m => `${m.id}:${m.scoreHome}-${m.scoreAway}:${m.minute}`)
    .join("|");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}