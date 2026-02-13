export function confidenceModel(coverage, risk, consistency) {

  const base = coverage.score;

  const stabilityBonus =
    (consistency?.defensiveStabilityIndex || 0.5) * 0.2;

  const volatilityPenalty =
    (risk?.volatilityIndex || 0.5) * 0.4;

  return Math.max(0, Math.min(1, base + stabilityBonus - volatilityPenalty));
}