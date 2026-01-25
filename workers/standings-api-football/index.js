export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const result = await runStandings(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "content-type": "application/json" }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: err.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  }
};

async function runStandings(env) {
  const LEAGUES = [
    { slug: "eng.1", apiLeague: 39 },
    { slug: "esp.1", apiLeague: 140 },
    { slug: "ita.1", apiLeague: 135 },
    { slug: "fra.1", apiLeague: 61 },
    { slug: "ger.1", apiLeague: 78 },
    { slug: "por.1", apiLeague: 94 },
    { slug: "ned.1", apiLeague: 88 },
    { slug: "bel.1", apiLeague: 144 },
    { slug: "gre.1", apiLeague: 197 }
  ];

  const SEASON = 2025; // σωστό για 2025–26

  let written = 0;
  const details = [];

  for (const l of LEAGUES) {
    try {
      // 1) Επιβεβαίωση current season από API
      const leagueInfoRes = await fetch(
        `https://v3.football.api-sports.io/leagues?id=${l.apiLeague}&current=true`,
        {
          headers: { "x-apisports-key": env.API_FOOTBALL_KEY }
        }
      );

      const leagueInfo = await leagueInfoRes.json();
      const currentSeason =
        leagueInfo?.response?.[0]?.seasons?.[0]?.year;

      if (currentSeason !== SEASON) {
        details.push({
          leagueSlug: l.slug,
          status: "season-mismatch",
          apiSeason: currentSeason
        });
        continue;
      }

      // 2) Fetch standings
      const res = await fetch(
        `https://v3.football.api-sports.io/standings?league=${l.apiLeague}&season=${SEASON}`,
        {
          headers: { "x-apisports-key": env.API_FOOTBALL_KEY }
        }
      );

      const json = await res.json();
      const standings =
        json?.response?.[0]?.league?.standings?.[0];

      // 3) Αν ΔΕΝ υπάρχουν ακόμα standings → γράφουμε metadata
      if (!standings || standings.length === 0) {
        const metaPayload = {
          leagueSlug: l.slug,
          season: SEASON,
          source: "api-football",
          standings: [],
          note: "standings_not_available_yet",
          updatedAt: new Date().toISOString()
        };

        await env.AIMATCHLAB_KV_CORE.put(
          `STANDINGS:OFFICIAL:${l.slug}`,
          JSON.stringify(metaPayload)
        );

        details.push({
          leagueSlug: l.slug,
          status: "no-standings-yet"
        });
        continue;
      }

      // 4) Κανονική εγγραφή standings
      const payload = {
        leagueSlug: l.slug,
        season: SEASON,
        source: "api-football",
        standings: standings.map(r => ({
          teamId: r.team.id,
          name: r.team.name,
          rank: r.rank,
          played: r.all.played,
          win: r.all.win,
          draw: r.all.draw,
          lose: r.all.lose,
          goalsFor: r.all.goals.for,
          goalsAgainst: r.all.goals.against,
          goalDiff: r.goalsDiff,
          points: r.points
        })),
        updatedAt: new Date().toISOString()
      };

      await env.AIMATCHLAB_KV_CORE.put(
        `STANDINGS:OFFICIAL:${l.slug}`,
        JSON.stringify(payload)
      );

      written++;
      details.push({
        leagueSlug: l.slug,
        status: "written"
      });
    } catch (err) {
      details.push({
        leagueSlug: l.slug,
        error: err.message
      });
    }
  }

  return {
    ok: true,
    season: SEASON,
    written,
    leagues: LEAGUES.length,
    details
  };
}
