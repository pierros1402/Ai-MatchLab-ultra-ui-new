// ============================================================
// MATCH REGIME DETECTOR
// Determines the structural nature of the game state
// ============================================================

export function detectMatchRegime(intel) {

  if (!intel) return null;

  const tempo =
    Number(intel?.metrics?.tempo ?? 0);

  const volatility =
    Number(intel?.metrics?.volatility ?? 0);

  const control =
    Number(intel?.metrics?.control ?? 0);

  const drift =
    Number(intel?.drift?.magnitude ?? 0);

  const phase =
    String(intel?.meta?.phase ?? "PRE");

  // ------------------------------------------------------------
  // NORMALIZATION
  // ------------------------------------------------------------

  const tempoLevel =
    tempo > 0.6 ? "HIGH" :
    tempo > 0.3 ? "MED" :
    "LOW";

  const volatilityLevel =
    volatility > 0.7 ? "HIGH" :
    volatility > 0.4 ? "MED" :
    "LOW";

  const controlLevel =
    control > 0.6 ? "HIGH" :
    control > 0.3 ? "MED" :
    "LOW";

  // ------------------------------------------------------------
  // REGIME CLASSIFICATION
  // ------------------------------------------------------------

  let regime = "BALANCED";

  if (tempoLevel === "HIGH" && volatilityLevel === "HIGH") {
    regime = "CHAOTIC";
  }

  else if (tempoLevel === "HIGH" && controlLevel === "LOW") {
    regime = "OPEN";
  }

  else if (tempoLevel === "LOW" && controlLevel === "HIGH") {
    regime = "TACTICAL";
  }

  else if (controlLevel === "HIGH" && volatilityLevel === "LOW") {
    regime = "CONTROLLED";
  }

  else if (tempoLevel === "MED" && volatilityLevel === "MED") {
    regime = "TRANSITIONAL";
  }

  // ------------------------------------------------------------
  // CONFIDENCE SCORE
  // ------------------------------------------------------------

  let confidence =
    (Math.abs(tempo - volatility) +
     Math.abs(control - volatility)) / 2;

  confidence =
    Math.max(0, Math.min(1, confidence));

  // drift amplifies regime certainty
  if (drift > 0.8) {
    confidence = Math.min(1, confidence + 0.2);
  }

  return {
    type: regime,
    tempo: tempoLevel,
    volatility: volatilityLevel,
    control: controlLevel,
    phase,
    confidence: Number(confidence.toFixed(3))
  };
}