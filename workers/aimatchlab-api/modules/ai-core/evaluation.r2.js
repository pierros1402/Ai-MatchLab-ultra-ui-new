export async function storeEvaluationR2(env, matchId, dateKey, evaluation) {

  if (!env?.AIMATCHLAB_INTEL) return;

  const matchPath = `evaluation/${dateKey}/${matchId}.json`;
  const dailyPath = `daily/${dateKey}.json`;

  // Store per-match evaluation
  await env.AIMATCHLAB_INTEL.put(
    matchPath,
    JSON.stringify(evaluation, null, 2)
  );

  // Update daily aggregate
  let daily = { matches: [], aggregated: null };

  const existing = await env.AIMATCHLAB_INTEL.get(dailyPath);
  if (existing) {
    try { daily = JSON.parse(await existing.text()); }
    catch {}
  }

  daily.matches.push(evaluation);

  const total = daily.matches.length;

  const avg = (key) =>
    daily.matches.reduce((s, m) => s + (m[key] || 0), 0) / total;

  daily.aggregated = {
    matches: total,
    avgStructuralHit: avg("structuralHit"),
    avgVolatilityError: avg("volatilityError"),
    avgConfidenceCalibration: avg("confidenceCalibrationScore"),
    avgOverallGrade: avg("overallGrade")
  };

  await env.AIMATCHLAB_INTEL.put(
    dailyPath,
    JSON.stringify(daily, null, 2)
  );
}