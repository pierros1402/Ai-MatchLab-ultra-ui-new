/**
 * AIMATCHLAB – TEAM STATS WORKER (FINAL v3 – PER TEAM)
 * Source of truth: MATCH:FT:* (AIMATCHLAB_KV_CORE)
 * Output: TEAM_STATS:<teamId> (AIMATCHLAB_STATS)
 */

const WINDOW = 4; // bootstrap window (μπορείς να το ανεβάσεις αργότερα)

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
  console.log("[stats] start");

  const teamMatches = new Map();
  let ftSeen = 0;

  let cursor;
  do {
    const res = await env.AIMATCHLAB_KV_CORE.list({
      prefix: "MATCH:FT:",
      cursor
    });

    for (const key of res.keys) {
      const m = await env.AIMATCHLAB_KV_CORE.get(key.name, "json");
      if (!m) continue;

      const homeId = m.homeId || m.homeTeamId;
      const awayId = m.awayId || m.awayTeamId;

      if (!homeId || !awayId) continue;

      ftSeen++;

      push(teamMatches, homeId, m.scoreHome, m.scoreAway);
      push(teamMatches, awayId, m.scoreAway, m.scoreHome);
    }

    cursor = res.cursor;
  } while (cursor);

  console.log("[stats] FT seen:", ftSeen);
  console.log("[stats] teams:", teamMatches.size);

  let written = 0;

  for (const [teamId, list] of teamMatches.entries()) {
    if (list.length < WINDOW) continue;

    const slice = list.slice(-WINDOW);
    const stats = compute(teamId, slice);

    await env.AIMATCHLAB_STATS.put(
      `TEAM_STATS:${teamId}`,
      JSON.stringify(stats)
    );
    written++;
  }

  console.log("[stats] written:", written);
}

function push(map, teamId, gf, ga) {
  if (!map.has(teamId)) map.set(teamId, []);
  map.get(teamId).push({ gf, ga });
}

function compute(teamId, matches) {
  let gf = 0,
    ga = 0,
    btts = 0,
    o25 = 0;

  for (const m of matches) {
    gf += m.gf;
    ga += m.ga;
    if (m.gf > 0 && m.ga > 0) btts++;
    if (m.gf + m.ga >= 3) o25++;
  }

  const n = matches.length;

  return {
    teamId,
    matches_used: n,
    goals_for_avg: +(gf / n).toFixed(2),
    goals_against_avg: +(ga / n).toFixed(2),
    btts_rate: +(btts / n).toFixed(2),
    over25_rate: +(o25 / n).toFixed(2),
    updatedAt: new Date().toISOString()
  };
}
