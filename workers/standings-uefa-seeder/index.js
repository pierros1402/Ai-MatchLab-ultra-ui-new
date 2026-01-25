/**
 * AIMATCHLAB — UEFA STANDINGS SEEDER
 *
 * Role:
 * - Fetch CURRENT SEASON standings from ESPN
 * - UEFA FIRST DIVISIONS ONLY (≈55 leagues)
 * - Manual execution ONLY (/run)
 * - Write ONLY when valid standings exist
 * - KV: AIMATCHLAB_KV_CORE
 *
 * NO cron
 * NO fixtures dependency
 */

const UEFA_LEAGUES = [
  // Big 5
  "eng.1","esp.1","ita.1","ger.1","fra.1",

  // Europe A–Z
  "ned.1","por.1","bel.1","sco.1","aut.1","sui.1","gre.1","cyp.1",
  "den.1","nor.1","swe.1","fin.1","isl.1",
  "pol.1","cze.1","svk.1","hun.1","rou.1","bul.1",
  "srb.1","cro.1","svn.1","bos.1","mkd.1","alb.1","kos.1","mne.1",
  "ukr.1","rus.1","blr.1",
  "tur.1","isr.1",
  "irl.1","wal.1","nir.1",
  "lux.1","mlt.1","and.1","smr.1","lie.1",
  "lat.1","ltu.1","est.1",
  "arm.1","geo.1","aze.1",
  "kaz.1"
];

async function fetchStandings(slug) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/standings`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const json = await res.json();
  const entries = json?.standings?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const table = entries.map(e => ({
    team: e.team?.displayName ?? null,
    p: e.stats?.find(s => s.name === "gamesPlayed")?.value ?? null,
    w: e.stats?.find(s => s.name === "wins")?.value ?? null,
    d: e.stats?.find(s => s.name === "ties")?.value ?? null,
    l: e.stats?.find(s => s.name === "losses")?.value ?? null,
    gf: e.stats?.find(s => s.name === "pointsFor")?.value ?? null,
    ga: e.stats?.find(s => s.name === "pointsAgainst")?.value ?? null,
    gd: e.stats?.find(s => s.name === "pointDifferential")?.value ?? null,
    pts: e.stats?.find(s => s.name === "points")?.value ?? null
  })).filter(r => r.team && r.p !== null);

  if (table.length === 0) return null;

  return {
    leagueSlug: slug,
    leagueName: json?.leagues?.[0]?.name ?? slug,
    season: json?.season?.year ?? null,
    table,
    updatedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return new Response("Not Found", { status: 404 });
    }

    if (!env.AIMATCHLAB_KV_CORE) {
      return new Response(JSON.stringify({
        ok: false,
        error: "KV binding AIMATCHLAB_KV_CORE missing"
      }), { status: 500 });
    }

    let written = 0;
    const details = [];

    for (const slug of UEFA_LEAGUES) {
      try {
        const payload = await fetchStandings(slug);
        if (!payload) {
          details.push({ leagueSlug: slug, status: "no-standings" });
          continue;
        }

        const key = `STANDINGS:UEFA:${slug}`;
        await env.AIMATCHLAB_KV_CORE.put(key, JSON.stringify(payload));
        written++;
        details.push({ leagueSlug: slug, status: "written" });
      } catch (err) {
        details.push({
          leagueSlug: slug,
          status: "error",
          error: err.message
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      written,
      total: UEFA_LEAGUES.length,
      details
    }, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
