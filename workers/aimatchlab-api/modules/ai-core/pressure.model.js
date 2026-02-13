export function pressureModel(data, identity, state) {

  const scoreDiff = (data.core.scoreHome || 0) - (data.core.scoreAway || 0);
  const status = data.core.status || "";
  const minute = Number(data.core.minute || 0);

  let phaseBoost = 0;
  if (status.includes("IN_PROGRESS")) {
    if (minute >= 70) phaseBoost = 0.3;
    else if (minute >= 45) phaseBoost = 0.2;
    else phaseBoost = 0.1;
  }

  const trailing = scoreDiff === 0 ? 0 : scoreDiff > 0 ? -1 : 1;

  return {
    psychologicalSwing: trailing * 0.25,
    collapseRiskHome: scoreDiff > 0 ? 0.15 + phaseBoost : 0.35 - phaseBoost,
    collapseRiskAway: scoreDiff < 0 ? 0.15 + phaseBoost : 0.35 - phaseBoost
  };
}