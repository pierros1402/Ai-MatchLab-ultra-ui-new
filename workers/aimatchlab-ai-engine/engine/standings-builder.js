//============================================================
// STANDINGS BUILDER – STABLE v4.2
// - Fully guarded R2 pagination
// - No undefined crashes
// - Deterministic ranking
//============================================================
export async function buildStandingsFromR2(env, league, season) {
  const prefix = `league/${league}/${season}/matches/`;

  const table = {};
  let cursor = undefined;

  while (true) {
    const options = cursor ? { prefix, cursor } : { prefix };

    const list = await env.AI_STATE.list(options);
    if (!list || !Array.isArray(list.objects)) break;

    for (const obj of list.objects) {
      const raw = await env.AI_STATE.get(obj.key);
      if (!raw) continue;

      let match;
      try {
        match = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        // corrupted entry — skip
        continue;
      }

      if (!match || typeof match !== "object") continue;

      if (
        match.status !== "STATUS_FINAL" &&
        match.status !== "FINAL"
      ) continue;

      const home = match.home;
      const away = match.away;
      const gf = Number(match.scoreHome);
      const ga = Number(match.scoreAway);

      if (!home || !away) continue;
      if (!Number.isFinite(gf) || !Number.isFinite(ga)) continue;

      update(table, home, gf, ga);
      update(table, away, ga, gf);
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  return Object.values(table).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
}

function update(table, team, gf, ga) {
  if (!table[team]) {
    table[team] = {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      points: 0
    };
  }

  const t = table[team];

  t.played++;
  t.gf += gf;
  t.ga += ga;

  if (gf > ga) {
    t.wins++;
    t.points += 3;
  } else if (gf === ga) {
    t.draws++;
    t.points += 1;
  } else {
    t.losses++;
  }
}