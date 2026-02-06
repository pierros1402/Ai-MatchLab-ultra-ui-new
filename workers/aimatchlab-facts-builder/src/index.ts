export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");
    if (!matchId) {
      return new Response(JSON.stringify({ ok: false, reason: "missing matchId" }), { status: 400 });
    }

    // --- Load match meta
    let match;
    try {
      const raw = await env.AIMATCHLAB_KV_CORE.get(`MATCH:${matchId}`);
      if (!raw) throw new Error("missing MATCH key");
      match = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: "match_not_found" }), { status: 404 });
    }

    // --- Load team stats (seasonal)
    let indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX");
    if (!indexRaw) indexRaw = await env.AIMATCHLAB_STATS.get("TEAM_STATS:INDEX\n");
    if (!indexRaw) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_team_stats_index" }), { status: 500 });
    }

    let latestSeason;
    try {
      latestSeason = JSON.parse(indexRaw).latest;
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_team_stats_index" }), { status: 500 });
    }

    const seasonRaw = await env.AIMATCHLAB_STATS.get(`TEAM_STATS:SEASON:${latestSeason}`);
    if (!seasonRaw) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_team_stats_season" }), { status: 500 });
    }

    let leagues;
    try {
      leagues = JSON.parse(seasonRaw).leagues || {};
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_team_stats_season" }), { status: 500 });
    }

    // --- Find teams
    const home = match.home;
    const away = match.away;

    let found;
    for (const leagueCode of Object.keys(leagues)) {
      const league = leagues[leagueCode];
      if (league?.[home] && league?.[away]) {
        found = { leagueCode, home: league[home], away: league[away] };
        break;
      }
    }

    if (!found) {
      return new Response(JSON.stringify({ ok: false, reason: "teams_not_found_in_stats" }), { status: 404 });
    }

    // --- Build FACTS (no AI)
    const facts = {
      matchId,
      generatedAt: Date.now(),
      season: latestSeason,
      leagueCode: found.leagueCode,
      standings: {
        homePos: found.home.position ?? null,
        awayPos: found.away.position ?? null,
        homePoints: found.home.points ?? null,
        awayPoints: found.away.points ?? null
      },
      form: {
        home: found.home.form ?? null,
        away: found.away.form ?? null
      },
      splits: {
        homeGoalsForAvg: found.home.goals_for_avg ?? null,
        awayGoalsForAvg: found.away.goals_for_avg ?? null
      }
    };

    const key = `stats/match/${matchId}/facts.json`;
    await env.AIMATCHLAB_INTEL.put(key, JSON.stringify(facts, null, 2));

    return new Response(JSON.stringify({ ok: true, facts }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};
