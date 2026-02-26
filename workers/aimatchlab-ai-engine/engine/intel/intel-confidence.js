// ============================================================
// INTEL CONFIDENCE ENGINE (deterministic v1)
// ============================================================

export function computeConfidence(intel) {
  if (!intel) return null;

  let score = 50;

  const phase = intel.meta?.phase;
  const ctx = intel.context || {};
  const delta = intel.delta;

  // ---------------- PHASE WEIGHT ----------------
  if (phase === "LIVE") score += 10;
  if (phase === "FINAL") score += 20;

  // ---------------- MOMENTUM ----------------
  if (ctx.momentum === "HOME_ADV" || ctx.momentum === "AWAY_ADV") {
    score += 10;
  }

  // ---------------- CONTROL ----------------
  if (ctx.control === "HOME" || ctx.control === "AWAY") {
    score += 10;
  }

  // ---------------- VOLATILITY ----------------
  if (ctx.volatility === "HIGH") score -= 15;
  if (ctx.volatility === "LOW") score += 5;

  // ---------------- SCORE EVENT ----------------
  if (delta?.scoreChange) score += 5;

  // clamp
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  return {
    value: score,
    level: levelFromScore(score)
  };
}

function levelFromScore(v) {
  if (v >= 80) return "STRONG";
  if (v >= 65) return "STABLE";
  if (v >= 45) return "NEUTRAL";
  if (v >= 30) return "UNSTABLE";
  return "CHAOTIC";
}