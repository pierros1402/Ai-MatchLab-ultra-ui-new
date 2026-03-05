// ============================================================
// INTEL DELTA ENGINE (Hybrid v2 – quantitative)
// ============================================================

export function computeIntelDelta(prev, curr, minute = 0) {
  if (!prev || !curr) return null;

  const minuteRatio = clamp(minute / 90, 0, 1);

  const delta = {
    phase: detectPhase(minuteRatio),
    minuteRatio,

    structuralShift: 0,
    momentumShift: 0,
    volatilityShift: 0,
    controlShift: 0,
    confidenceShift: 0,
    goalShock: false,

    strength: 0,
    summary: []
  };

  // -----------------------------
  // CONTEXT SHIFTS (numeric safe)
  // -----------------------------

  delta.momentumShift =
    numericDiff(prev.context?.momentumScore, curr.context?.momentumScore);

  delta.volatilityShift =
    numericDiff(prev.context?.volatilityScore, curr.context?.volatilityScore);

  delta.controlShift =
    numericDiff(prev.context?.controlScore, curr.context?.controlScore);

  delta.confidenceShift =
    numericDiff(prev.meta?.confidence, curr.meta?.confidence);

  // -----------------------------
  // STRUCTURAL SHIFT (aggregate)
  // -----------------------------

  delta.structuralShift =
    avgAbs([
      delta.momentumShift,
      delta.volatilityShift,
      delta.controlShift
    ]);

  // -----------------------------
  // GOAL SHOCK
  // -----------------------------

  const psH = Number(prev.basic?.scoreHome ?? 0);
  const psA = Number(prev.basic?.scoreAway ?? 0);
  const csH = Number(curr.basic?.scoreHome ?? 0);
  const csA = Number(curr.basic?.scoreAway ?? 0);

  if (psH !== csH || psA !== csA) {
    delta.goalShock = true;

    const diff = `${psH}-${psA} → ${csH}-${csA}`;
    delta.summary.push(`Goal event (${diff})`);
  }

  // -----------------------------
  // STRENGTH SCORING
  // -----------------------------

  let strength =
    Math.abs(delta.structuralShift) * 0.6 +
    Math.abs(delta.volatilityShift) * 0.2 +
    Math.abs(delta.confidenceShift) * 0.2;

  if (delta.goalShock) strength += 0.25;

  // Phase weighting (Hybrid logic)
  if (delta.phase === "EARLY") strength *= 0.8;
  if (delta.phase === "LATE") strength *= 1.2;

  delta.strength = clamp(round(strength, 4), 0, 1);

  // -----------------------------
  // SUMMARY FLAGS
  // -----------------------------

  if (Math.abs(delta.structuralShift) > 0.15)
    delta.summary.push("Structural shift");

  if (Math.abs(delta.volatilityShift) > 0.12)
    delta.summary.push("Volatility spike");

  if (Math.abs(delta.confidenceShift) > 0.1)
    delta.summary.push("Confidence mutation");

  if (!delta.summary.length && !delta.goalShock)
    return null;

  return delta;
}

// ============================================================
// HELPERS
// ============================================================

function numericDiff(a, b) {
  if (!isFinite(a) || !isFinite(b)) return 0;
  return round(b - a, 4);
}

function avgAbs(arr) {
  const vals = arr.filter(v => isFinite(v));
  if (!vals.length) return 0;
  return round(
    vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length,
    4
  );
}

function detectPhase(r) {
  if (r <= 0.2) return "EARLY";
  if (r <= 0.65) return "MID";
  if (r < 1) return "LATE";
  return "TERMINAL";
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(v, d = 4) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}