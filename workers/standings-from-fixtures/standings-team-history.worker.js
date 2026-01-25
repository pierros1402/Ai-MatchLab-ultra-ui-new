export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/internal/run") {
      return new Response("Not Found", { status: 404 });
    }
    await run(env);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

async function run(env) {
  console.log("[standings+history] start");

  // =========================
  // CONFIG
  // =========================
  const DAYS_BACK = 14;      // πόσες μέρες πίσω κοιτάμε
  const MAX_MATCHES = 30;    // max ιστορικά ανά ομάδα
  const VALID_FT = ["FT", "FINISHED", "FINAL"];

  // =========================
  // BUCKETS
  // =========================
  const standingsByLeague = new Map(); // leagueSlug -> table
  const teamMatches = new Map();        // teamId -> [matches]

  const today = new Date();

  // =========================
  // READ FIXTURES
  // =========================
  for (let i = 0; i < DAYS_BACK; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayKey = d.toISOString().slice(0, 10);

    const kvKey = `FIXTURES:DATE:${dayKey}`;
    const data = await env.AIMATCHLAB_KV_CORE.get(kvKey, "json");
    if (!data || !Array.isArray(data.matches)) continue;

    for (const m of data.matches) {
      if (!VALID_FT.includes(m.status)) continue;

      const league = m.leagueSlug || "unknown";

      // -------------------------
      // STANDINGS (ΟΠΩΣ ΠΡΙΝ)
      // -------------------------
      if (!standingsByLeague.has(league)) {
        standingsByLeague.set(league, new Map());
      }
      const table = standingsByLeague.get(league);

      applyStandingRow(table, m.homeTeamId, m.home, m.scoreHome, m.scoreAway);
      applyStandingRow(table, m.awayTeamId, m.away, m.scoreAway, m.scoreHome);

      // -------------------------
      // TEAM HISTORY (ΝΕΟ)
      // -------------------------
      const homeId = String(m.homeTeamId);
      const awayId = String(m.awayTeamId);

      const homeGoals = Number(m.scoreHome);
      const awayGoals = Number(m.scoreAway);

      const base = {
        date: dayKey,
        league,
        btts: homeGoals > 0 && awayGoals > 0,
        over25: homeGoals + awayGoals >= 3
      };

      pushTeamMatch(teamMatches, homeId, {
        ...base,
        homeAway: "home",
        goalsFor: homeGoals,
        goalsAgainst: awayGoals
      });

      pushTeamMatch(teamMatches, awayId, {
        ...base,
        homeAway: "away",
        goalsFor: awayGoals,
        goalsAgainst: homeGoals
      });
    }
  }

  // =========================
  // WRITE STANDINGS
  // =========================
  let leaguesWritten = 0;

  for (const [league, table] of standingsByLeague.entries()) {
    const rows = Array.from(table.values())
      .sort((a, b) => b.pts - a.pts || b.gf - a.gf);

    await env.AIMATCHLAB_KV_CORE.put(
      `STANDINGS:CURRENT:${league}`,
      JSON.stringify({
        league,
        updatedAt: Date.now(),
        rows
      })
    );
    leaguesWritten++;
  }

  // =========================
  // WRITE TEAM MATCHES (ΝΕΟ)
  // =========================
  let teamsWritten = 0;

  for (const [teamId, matches] of teamMatches.entries()) {
    const trimmed = matches.slice(-MAX_MATCHES);
    await env.AIMATCHLAB_STATS.put(
      `TEAM_MATCHES:${teamId}`,
      JSON.stringify(trimmed)
    );
    teamsWritten++;
  }

  console.log("[standings+history] leagues:", leaguesWritten);
  console.log("[standings+history] teams:", teamsWritten);
}

// ===================================================
// HELPERS
// ===================================================
function applyStandingRow(table, teamId, name, gf, ga) {
  const id = String(teamId);
  if (!table.has(id)) {
    table.set(id, {
      teamId: id,
      name,
      played: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      pts: 0
    });
  }

  const row = table.get(id);
  row.played++;
  row.gf += gf;
  row.ga += ga;

  if (gf > ga) {
    row.w++;
    row.pts += 3;
  } else if (gf === ga) {
    row.d++;
    row.pts += 1;
  } else {
    row.l++;
  }
}

function pushTeamMatch(map, teamId, match) {
  if (!map.has(teamId)) map.set(teamId, []);
  map.get(teamId).push(match);
}
