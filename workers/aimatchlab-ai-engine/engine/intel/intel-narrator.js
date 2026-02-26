// ============================================================
// INTEL NARRATOR (deterministic explanation layer)
// ============================================================

export function buildNarrative(delta) {
  if (!delta) return null;

  const lines = [];

  // momentum
  if (delta.momentumChange) {
    lines.push("Match momentum has shifted.");
  }

  // control
  if (delta.controlChange) {
    if (delta.controlChange.includes("HOME")) {
      lines.push("Home side appears to be managing the match.");
    } else if (delta.controlChange.includes("AWAY")) {
      lines.push("Away side has taken control of the game.");
    } else {
      lines.push("Game has become more open.");
    }
  }

  // volatility
  if (delta.volatilityChange) {
    lines.push("Match volatility is increasing.");
  }

  // score
  if (delta.scoreChange) {
    lines.push("The scoreline has changed, altering match dynamics.");
  }

  if (!lines.length) return null;

  return lines;
}