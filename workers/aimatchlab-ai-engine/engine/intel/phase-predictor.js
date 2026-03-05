// ============================================================
// MATCH PHASE PREDICTOR
// Predicts imminent game phase shifts
// ============================================================

export function predictNextPhase(intel) {

  if (!intel) return null;

  const minute =
    Number(intel?.basic?.minute ??
           intel?.basic?.clock ??
           0);

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

  if (phase !== "LIVE") return null;

  let nextPhase = null;
  let probability = 0;

  // ------------------------------------------------------------
  // BREAKTHROUGH WINDOW
  // ------------------------------------------------------------

  if (tempo > 0.6 && volatility > 0.6 && drift > 0.4) {
    nextPhase = "BREAKTHROUGH_WINDOW";
    probability = (tempo + volatility + drift) / 3;
  }

  // ------------------------------------------------------------
  // CONTROL COLLAPSE
  // ------------------------------------------------------------

  if (control < 0.3 && volatility > 0.5) {
    nextPhase = "CONTROL_COLLAPSE";
    probability = (volatility + (1-control)) / 2;
  }

  // ------------------------------------------------------------
  // TEMPO DROP
  // ------------------------------------------------------------

  if (tempo < 0.25 && control > 0.6) {
    nextPhase = "TEMPO_DROP";
    probability = (control + (1-tempo)) / 2;
  }

  if (!nextPhase) return null;

  probability =
    Math.max(0, Math.min(1, probability));

  return {
    predictedPhase: nextPhase,
    probability: Number(probability.toFixed(3)),
    minute
  };
}