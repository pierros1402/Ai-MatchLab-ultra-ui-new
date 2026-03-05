// ============================================================
// INTEL NARRATOR (v2 drift-based deterministic)
// ============================================================

export function buildNarrative(delta, phase = "PRE") {
  if (!delta) return null;

  const lines = [];

  const tempo = Number(delta.tempoDeviationPct || 0);
  const volatility = Number(delta.volatilityDeviationPct || 0);
  const control = Number(delta.controlDeviationPct || 0);
  const driftScore = Number(delta.driftScore || 0);

  const p = String(phase || "PRE").toUpperCase();

  // No narrative for PRE unless extreme (safety)
  if (p !== "LIVE") return null;

  // ---------------- MOMENTUM ----------------
  if (Math.abs(tempo) >= 15) {
    lines.push("Match tempo has shifted.");
  }

  // ---------------- CONTROL ----------------
  if (Math.abs(control) >= 15) {
    if (control > 0) {
      lines.push("Home side is gaining control.");
    } else {
      lines.push("Away side is gaining control.");
    }
  }

  // ---------------- VOLATILITY ----------------
  if (volatility >= 25) {
    lines.push("Match volatility is increasing.");
  }

  // ---------------- STRONG DRIFT ----------------
  if (driftScore >= 60) {
    lines.push("Match dynamics are shifting significantly.");
  }

  if (!lines.length) return null;

  return lines;
}