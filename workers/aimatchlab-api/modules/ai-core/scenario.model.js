export function scenarioModel(strength, state, risk) {

  const dominant = strength.baseEdgeHome > 0.5 ? "home" : "away";

  let scenarioType = "stable";

  if (risk.regimeShiftRisk > 0.5) {
    scenarioType = "high_instability";
  } else if (risk.comebackProbability > 0.4) {
    scenarioType = "comeback_active";
  }

  return {
    dominantBranch: dominant,
    scenarioType,
    branchProbability: Math.max(strength.baseEdgeHome, strength.baseEdgeAway),
    regimeShiftRisk: risk.regimeShiftRisk,
    comebackProbability: risk.comebackProbability,
    transitionProbability: risk.lateGoalProbability
  };
}