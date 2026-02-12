export function pressureModel(data, identity, state) {
  const scoreDiff = (data.core.scoreHome || 0) - (data.core.scoreAway || 0);

  return {
    psychologicalSwing: scoreDiff === 0 ? 0 : scoreDiff > 0 ? 0.2 : -0.2,
    collapseRiskHome: scoreDiff > 0 ? 0.1 : 0.3,
    collapseRiskAway: scoreDiff < 0 ? 0.1 : 0.3
  };
}