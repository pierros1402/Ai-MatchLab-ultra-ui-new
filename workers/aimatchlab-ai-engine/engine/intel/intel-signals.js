// ============================================================
// INTEL SIGNAL ENGINE (v1 deterministic)
// ============================================================

export function generateSignals(prev, curr) {
  if (!prev || !curr) return [];

  const signals = [];

  const d = curr.delta;
  if (!d) return signals;

  // ---------------- MOMENTUM SHIFT ----------------
  if (d.momentumChange) {
    signals.push({
      type: "MOMENTUM_SHIFT",
      severity: "MEDIUM"
    });
  }

  // ---------------- CONTROL CHANGE ----------------
  if (d.controlChange) {
    signals.push({
      type: "CONTROL_CHANGE",
      severity: "MEDIUM"
    });
  }

  // ---------------- VOLATILITY SPIKE ----------------
  if (d.volatilityChange?.includes("HIGH")) {
    signals.push({
      type: "VOLATILITY_SPIKE",
      severity: "HIGH"
    });
  }

  // ---------------- GOAL EVENT ----------------
  if (d.scoreChange) {
    signals.push({
      type: "GOAL_EVENT",
      severity: "HIGH"
    });
  }
  signals.push({
    type: "DEBUG_SIGNAL",
    importance: "HIGH",
    ts: Date.now()
  });
  return signals;
}