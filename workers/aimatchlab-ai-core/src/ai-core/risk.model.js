export function riskModel(data, strength, state) {
  const volatility = state?.tempoIndex ? state.tempoIndex / 100 : 0.5;

  return {
    volatilityIndex: volatility,
    upsetProbability: 1 - Math.max(strength.baseEdgeHome, strength.baseEdgeAway),
    drawGravity: 0.3 + (volatility * 0.2),
    lateGoalProbability: volatility * 0.6
  };
}