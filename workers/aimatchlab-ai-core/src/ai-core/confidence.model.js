export function confidenceModel(coverage, risk) {
  const base = coverage.score;
  const stabilityPenalty = risk.volatilityIndex * 0.3;
  return Math.max(0, Math.min(1, base - stabilityPenalty));
}