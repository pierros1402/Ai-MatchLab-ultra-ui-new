// ============================================================
// INTEL VALUE CORE (v1 deterministic bias layer)
// Converts intel state → value bias profile
// ============================================================

export function computeValueBias(intel) {
  if (!intel || !intel.context) return null;

  const {
    context,
    leaguePressure,
    drift,
    confidence,
    model
  } = intel;

  const momentum = context.momentum || "UNKNOWN";
  const control = context.control || "BALANCED";
  const volatility = context.volatility || "UNKNOWN";
  const overLean = context.overLean || "NEUTRAL";

  const driftMag = Number(drift?.magnitude ?? 0);
  const stability = Number(model?.stability ?? 0.5);
  const confVal = Number(confidence?.value ?? 50);

  // ------------------------------------------------------------
  // SIDE LEAN
  // ------------------------------------------------------------
  let sideLean = "NEUTRAL";

  if (momentum === "HOME_ADV" || control === "HOME_CONTROL") {
    sideLean = "HOME";
  }

  if (momentum === "AWAY_ADV" || control === "AWAY_CONTROL") {
    sideLean = "AWAY";
  }

  // pressure override
  if (leaguePressure?.home === "SURVIVAL") sideLean = "HOME";
  if (leaguePressure?.away === "SURVIVAL") sideLean = "AWAY";

  // ------------------------------------------------------------
  // TOTAL LEAN
  // ------------------------------------------------------------
  let totalLean = "NEUTRAL";

  if (volatility === "HIGH" || driftMag > 0.8) {
    totalLean = "OVER";
  }

  if (volatility === "LOW" && driftMag < 0.3) {
    totalLean = "UNDER";
  }

  if (overLean === "OVER") totalLean = "OVER";
  if (overLean === "UNDER") totalLean = "UNDER";

  // ------------------------------------------------------------
  // RISK PROFILE
  // ------------------------------------------------------------
  let riskProfile = "MEDIUM";

  if (stability > 0.75 && driftMag < 0.5) {
    riskProfile = "LOW";
  }

  if (stability < 0.4 || driftMag > 1.2) {
    riskProfile = "HIGH";
  }

  // ------------------------------------------------------------
  // CONFIDENCE ADJUSTMENT
  // ------------------------------------------------------------
  const confidenceAdj =
    Math.round((confVal - 50) * (1 - driftMag));

  return {
    sideLean,
    totalLean,
    riskProfile,
    confidenceAdj,
    version: 1
  };
}