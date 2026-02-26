// ============================================================
// INTEL DELTA ENGINE (minimal v1)
// ============================================================

export function computeIntelDelta(prev, curr) {
  if (!prev || !curr) return null;

  const delta = {
    momentumChange: null,
    volatilityChange: null,
    controlChange: null,
    scoreChange: null,
    summary: []
  };

  // momentum
  if (prev.context?.momentum !== curr.context?.momentum) {
    delta.momentumChange =
      `${prev.context?.momentum} → ${curr.context?.momentum}`;
    delta.summary.push("Momentum changed");
  }

  // volatility
  if (prev.context?.volatility !== curr.context?.volatility) {
    delta.volatilityChange =
      `${prev.context?.volatility} → ${curr.context?.volatility}`;
    delta.summary.push("Volatility shifted");
  }

  // control
  if (prev.context?.control !== curr.context?.control) {
    delta.controlChange =
      `${prev.context?.control} → ${curr.context?.control}`;
    delta.summary.push("Control changed");
  }

  // score
  const psH = prev.basic?.scoreHome ?? 0;
  const psA = prev.basic?.scoreAway ?? 0;
  const csH = curr.basic?.scoreHome ?? 0;
  const csA = curr.basic?.scoreAway ?? 0;

  if (psH !== csH || psA !== csA) {
    delta.scoreChange = `${psH}-${psA} → ${csH}-${csA}`;
    delta.summary.push("Scoreline changed");
  }

  if (!delta.summary.length) return null;

  return delta;
}