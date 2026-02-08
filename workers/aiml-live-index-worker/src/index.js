/**
 * AI MATCHLAB LIVE INDEX WORKER
 * Version: 2.0.0
 * Created: 2026-02-07
 * Architecture Phase: LIVE-INDEX-V2
 */

const VERSION = "2.0.0";
const CREATED = "2026-02-07";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json",
  };
}

function safe(v, d=null) {
  return v === undefined || v === null ? d : v;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors() });

    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        ok: true,
        service: "aiml-live-index-worker",
        version: VERSION,
        created: CREATED
      }), { headers: cors() });
    }

    if (!url.pathname.startsWith("/api/unified-live"))
      return new Response(JSON.stringify({ ok:false }), { status:404, headers:cors() });

    const api = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";
    const res = await fetch(api, { cf: { cacheTtl: 15, cacheEverything: true } });
    const data = await res.json().catch(() => ({}));

    const events = Array.isArray(data?.events) ? data.events : [];

    const matches = events.map(ev => {
      const comp = ev?.competitions?.[0] || {};
      const competitors = comp?.competitors || [];
      const home = competitors.find(c=>c.homeAway==="home")?.team?.displayName || null;
      const away = competitors.find(c=>c.homeAway==="away")?.team?.displayName || null;
      return {
        id: safe(ev?.id),
        home,
        away,
        status: safe(comp?.status?.type?.state),
        minute: safe(comp?.status?.displayClock),
        scoreHome: safe(competitors.find(c=>c.homeAway==="home")?.score),
        scoreAway: safe(competitors.find(c=>c.homeAway==="away")?.score),
        kickoff: safe(comp?.startDate)
      };
    }).filter(m=>m.home && m.away);

    return new Response(JSON.stringify({
      ok: true,
      service: "aiml-live-index-worker",
      version: VERSION,
      created: CREATED,
      matches
    }), { headers: cors() });
  }
};
