// ============================================================
// MATCH REGIME DETECTOR
// ============================================================

export function detectRegime(metrics = {}, context = {}) {

  const tempo = Number(metrics.tempo || 0);
  const volatility = Number(metrics.volatility || 0);
  const control = Number(metrics.control || 0);

  // ----------------------------------------
  // CHAOS
  // ----------------------------------------
  if (tempo > 2.9 && volatility > 1.25) {
    return {
      type: "CHAOS",
      confidenceBias: -8,
      signalBoost: 1.25
    };
  }

  // ----------------------------------------
  // CONTROL
  // ----------------------------------------
  if (control > 0.65 && volatility < 0.9) {
    return {
      type: "CONTROL",
      confidenceBias: +6,
      signalBoost: 0.85
    };
  }

  // ----------------------------------------
  // TRANSITION
  // ----------------------------------------
  if (tempo > 2.4 && volatility > 1.0) {
    return {
      type: "TRANSITION",
      confidenceBias: +2,
      signalBoost: 1.05
    };
  }

  return {
    type: "BALANCED",
    confidenceBias: 0,
    signalBoost: 1
  };
}