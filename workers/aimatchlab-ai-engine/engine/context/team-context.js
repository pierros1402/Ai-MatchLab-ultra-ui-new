// ============================================================
// TEAM CONTEXT ENGINE – Deterministic v2.0
// - Momentum
// - Volatility
// - Consistency
// - Clean Sheet / Fail To Score
// ============================================================

export async function buildTeamContext(env, league, season, team) {
// ------------------------------------------------------------
// TEAM CONTEXT CACHE
// ------------------------------------------------------------
const cacheKey =
  `team-context/${league}/${season}/${team}.json`;

try {

  const cached = await env.AI_STATE.get(cacheKey);

  if (cached) {
    const data = JSON.parse(await cached.text());

    // cache valid for 6 hours
    if (Date.now() - (data.generatedAt || 0) < 21600000) {
      return data;
    }

  }

} catch (_) {}
  const prefix = `league/${league}/${season}/matches/`;

  let cursor = undefined;
  const matches = [];

  while (true) {
    const options = cursor ? { prefix, cursor } : { prefix };
    const list = await env.AI_STATE.list(options);

    if (!list || !Array.isArray(list.objects)) break;

    for (const obj of list.objects) {
      const raw = await env.AI_STATE.get(obj.key);
      if (!raw) continue;

      let match;
      try {
        const text = await raw.text();
        match = JSON.parse(text);
      } catch {
        continue;
      }

      if (!match) continue;
      const status = String(match.status || "").toUpperCase();

      if (
        !status.includes("FINAL") &&
        !status.includes("FULL_TIME") &&
        !status.includes("AET")
      ) continue;

      if (match.home === team || match.away === team) {
        matches.push(match);
      }
    }

    if (!list.truncated) break;
    cursor = list.cursor;
  }

  matches.sort((a, b) => new Date(a.date) - new Date(b.date));

  const total = matches.length;

  if (!total) {
    return { ok: true, league, season, team, matches: 0 };
  }

  let gf = 0;
  let ga = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let over25 = 0;
  let btts = 0;
  let cleanSheets = 0;
  let failToScore = 0;

  const goalTotals = [];

  for (const m of matches) {
    const isHome = m.home === team;
    const scored = isHome ? Number(m.scoreHome) : Number(m.scoreAway);
    const conceded = isHome ? Number(m.scoreAway) : Number(m.scoreHome);

    if (!Number.isFinite(scored) || !Number.isFinite(conceded)) continue;

    gf += scored;
    ga += conceded;

    goalTotals.push(scored + conceded);

    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;

    if (scored + conceded > 2) over25++;
    if (scored > 0 && conceded > 0) btts++;
    if (conceded === 0) cleanSheets++;
    if (scored === 0) failToScore++;
  }

  // ------------------------------------------------------------
  // Momentum (last 5 weighted)
  // ------------------------------------------------------------

  const last5 = matches.slice(-5);

  let momentumScore = 0;
  let weight = 1;

  for (let i = last5.length - 1; i >= 0; i--) {
    const m = last5[i];
    const isHome = m.home === team;
    const scored = isHome ? Number(m.scoreHome) : Number(m.scoreAway);
    const conceded = isHome ? Number(m.scoreAway) : Number(m.scoreHome);

    let points = 0;
    if (scored > conceded) points = 3;
    else if (scored === conceded) points = 1;

    momentumScore += points * weight;
    weight++;
  }

  const n = last5.length || 1;
  const maxMomentum = 3 * n * (n + 1) / 2;
  const momentumIndex = +(momentumScore / maxMomentum).toFixed(2);

  // ------------------------------------------------------------
  // Volatility (goal variance)
  // ------------------------------------------------------------

  const avgGoals = goalTotals.reduce((a, b) => a + b, 0) / total;

  const variance =
    goalTotals.reduce((sum, val) => sum + Math.pow(val - avgGoals, 2), 0) /
    (total || 1);

  const volatilityIndex = +Math.sqrt(variance).toFixed(2);

  // ------------------------------------------------------------
  // Consistency (inverse volatility normalized)
  // ------------------------------------------------------------

  const consistencyScore =
    volatilityIndex === 0 ? 1 : +(1 / (1 + volatilityIndex)).toFixed(2);

  // ------------------------------------------------------------
  // Form Trend
  // ------------------------------------------------------------

  const recentPoints = last5.reduce((sum, m) => {
    const isHome = m.home === team;
    const scored = isHome ? Number(m.scoreHome) : Number(m.scoreAway);
    const conceded = isHome ? Number(m.scoreAway) : Number(m.scoreHome);

    if (scored > conceded) return sum + 3;
    if (scored === conceded) return sum + 1;
    return sum;
  }, 0);

  const previous5 = matches.slice(-10, -5);

  const previousPoints = previous5.reduce((sum, m) => {
    const isHome = m.home === team;
    const scored = isHome ? Number(m.scoreHome) : Number(m.scoreAway);
    const conceded = isHome ? Number(m.scoreAway) : Number(m.scoreHome);

    if (scored > conceded) return sum + 3;
    if (scored === conceded) return sum + 1;
    return sum;
  }, 0);

  let formTrend = "STABLE";
  if (recentPoints > previousPoints) formTrend = "IMPROVING";
  if (recentPoints < previousPoints) formTrend = "DECLINING";

  const result = {
  ok: true,
  league,
  season,
  team,
  matches: total,

  goalsForRate: +(gf / total).toFixed(2),
  goalsAgainstRate: +(ga / total).toFixed(2),
  winRate: +(wins / total).toFixed(2),
  drawRate: +(draws / total).toFixed(2),
  lossRate: +(losses / total).toFixed(2),
  over25Rate: +(over25 / total).toFixed(2),
  bttsRate: +(btts / total).toFixed(2),

  cleanSheetRate: +(cleanSheets / total).toFixed(2),
  failToScoreRate: +(failToScore / total).toFixed(2),

  momentumIndex,
  volatilityIndex,
  consistencyScore,
  formTrend
};

result.generatedAt = Date.now();

try {
  await env.AI_STATE.put(
    cacheKey,
    JSON.stringify(result),
    { httpMetadata:{ contentType:"application/json" } }
  );
} catch (_) {}

return result;
}