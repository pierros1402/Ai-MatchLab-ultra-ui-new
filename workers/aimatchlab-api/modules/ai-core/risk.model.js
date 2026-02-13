export function riskModel(data, strength, state, consistency) {

  const tempo = state?.tempoIndex || 40;
  const regimeShiftBase = consistency?.varianceScore || 0.3;

  const regimeShiftRisk =
    Math.min(1, regimeShiftBase + tempo / 200);

  const volatilityIndex =
    Math.min(1, 0.3 + tempo / 120 + regimeShiftRisk * 0.4);

  const comebackProbability =
    Math.min(1, (consistency?.formMomentumIndex || 0.5) * 0.5 + regimeShiftRisk * 0.5);

  return {
    volatilityIndex,
    regimeShiftRisk,
    comebackProbability,
    upsetProbability: 1 - Math.max(strength.baseEdgeHome, strength.baseEdgeAway),
    drawGravity: 0.3 + (consistency?.defensiveStabilityIndex || 0.5) * 0.2,
    lateGoalProbability: 0.2 + regimeShiftRisk * 0.4
  };
}