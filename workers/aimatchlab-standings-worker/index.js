/**
 * aimatchlab-standings-worker
 * ----------------------------------
 * Internal enrichment worker (HTTP-triggered).
 */

export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const token = req.headers.get("X-Internal-Token");
    if (!token || token !== env.INTERNAL_ENRICH_TOKEN) {
      console.log("[standings] forbidden");
      return new Response("Forbidden", { status: 403 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const { league, season } = payload || {};
    if (!league || !season) {
      return new Response("Missing league/season", { status: 400 });
    }

    console.log("[standings] start", league, season);

    const result = await enrichStandings(env, league, season);
    console.log("[standings] result", result);

    return new Response("enriched", { status: 200 });
  }
};

// =================================================
// ENRICHMENT LOGIC
// =================================================

async function enrichStandings(env, leagueSlug, season) {
  const table = await fetchStandingsFromFootballData(env, leagueSlug);

  console.log("[standings] table length", table?.length);

  if (!Array.isArray(table) || table.length === 0) {
    return { ok: false, reason: "empty-table" };
  }

  const key = `intel/standings/${leagueSlug}/${season}/latest.json`;

  const payload = {
    league: leagueSlug,
    season,
    updatedAt: new Date().toISOString(),
    table
  };

  await env.AIMATCHLAB_INTEL.put(
    key,
    JSON.stringify(payload, null, 2),
    { httpMetadata: { contentType: "application/json" } }
  );

  return { ok: true, key };
}

// =================================================
// Football-Data.org
// =================================================

async function fetchStandingsFromFootballData(env, leagueSlug) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing FOOTBALL_DATA_TOKEN");
  }

  const MAP = {
    "eng.1": "PL",
    "eng.2": "ELC",
    "esp.1": "PD",
    "ita.1": "SA",
    "fra.1": "FL1",
    "ger.1": "BL1",
    "ned.1": "DED",
    "por.1": "PPL"
  };

  const code = MAP[leagueSlug];
  if (!code) {
    console.log("[standings] unknown league", leagueSlug);
    return [];
  }

  const url = `https://api.football-data.org/v4/competitions/${code}/standings`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": env.FOOTBALL_DATA_TOKEN }
  });

  if (!res.ok) {
    console.log("[standings] api error", res.status);
    return [];
  }

  const json = await res.json();
  return json?.standings?.[0]?.table?.map(row => ({
    rank: row.position,
    teamId: row.team.id,
    teamName: row.team.name,
    played: row.playedGames,
    points: row.points,
    gd: row.goalDifference
  })) || [];
}
