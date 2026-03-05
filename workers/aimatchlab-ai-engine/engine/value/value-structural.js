// ============================================================
// VALUE STRUCTURAL ENGINE (v1 odds-agnostic)
// Converts model state → structural edge scoring
// ============================================================

export function computeStructuralValue(intel) {
  if (!intel) return null;

  const driftMag = Number(intel?.drift?.magnitude ?? 0);
  const stability = Number(intel?.model?.stability ?? 0.5);
  const conf = Number(intel?.confidence?.value ?? 50);

  const momentum = intel?.context?.momentum;
  const control = intel?.context?.control;
  const volatility = intel?.context?.volatility;

  // ------------------------------------------------------------
  // PRESSURE SCORES (0–100 scale)
  // ------------------------------------------------------------
  let homePressure = 50;
  let awayPressure = 50;

  if (momentum === "HOME_ADV") homePressure += 15;
  if (momentum === "AWAY_ADV") awayPressure += 15;

  if (control === "HOME_CONTROL") homePressure += 10;
  if (control === "AWAY_CONTROL") awayPressure += 10;

  homePressure += Math.round(conf * 0.1);
  awayPressure += Math.round(conf * 0.1);

  homePressure = Math.min(100, homePressure);
  awayPressure = Math.min(100, awayPressure);

  // ------------------------------------------------------------
  // TOTAL INTENSITY
  // ------------------------------------------------------------
  let overIntensity = 50;
  let underIntensity = 50;

  if (volatility === "HIGH") overIntensity += 20;
  if (volatility === "LOW") underIntensity += 15;

  overIntensity += Math.round(driftMag * 20);
  underIntensity -= Math.round(driftMag * 10);

  overIntensity = Math.max(0, Math.min(100, overIntensity));
  underIntensity = Math.max(0, Math.min(100, underIntensity));

  // ------------------------------------------------------------
  // MODEL EDGE SCORE
  // ------------------------------------------------------------
  const modelEdgeScore =
    Math.round((stability * conf) - (driftMag * 30));

  // ------------------------------------------------------------
  // REGIME CLASSIFICATION
  // ------------------------------------------------------------
  let regime = "STABLE";

  if (driftMag > 0.6) regime = "VOLATILE";
  if (driftMag > 1.2) regime = "CHAOTIC";

  return {
    homePressureScore: homePressure,
    awayPressureScore: awayPressure,
    overIntensity,
    underIntensity,
    modelEdgeScore,
    regime,
    version: 1
  };
}