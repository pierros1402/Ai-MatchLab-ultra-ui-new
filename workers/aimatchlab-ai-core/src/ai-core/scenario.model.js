export function scenarioModel(strength, state, risk) {
  const dominant = strength.baseEdgeHome > 0.5 ? "home" : "away";

  return {
    dominantBranch: dominant,
    branchProbability: Math.max(strength.baseEdgeHome, strength.baseEdgeAway),
    regimeShiftRisk: risk.volatilityIndex * 0.5,
    transitionProbability: risk.lateGoalProbability
  };
}