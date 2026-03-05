// ============================================================
// INTEL SIGNAL ENGINE (v2 drift-based deterministic)
// ============================================================

export function generateSignals(prev, curr) {
  if (!prev || !curr) return [];

  const signals = [];

  const d = curr.delta;
  if (!d) return signals;

  const tempo = Number(d.tempoDeviationPct || 0);
  const volatility = Number(d.volatilityDeviationPct || 0);
  const control = Number(d.controlDeviationPct || 0);

  const phase = String(curr?.meta?.phase || "PRE").toUpperCase();

  // Signals only during LIVE phase
  if (phase !== "LIVE") return signals;

  // ---------------- MOMENTUM SHIFT ----------------
  if (Math.abs(tempo) >= 15) {
    signals.push({
      type: "MOMENTUM_SHIFT",
      severity: Math.abs(tempo) >= 30 ? "HIGH" : "MEDIUM"
    });
  }

  // ---------------- CONTROL CHANGE ----------------
  if (Math.abs(control) >= 15) {
    signals.push({
      type: "CONTROL_CHANGE",
      severity: Math.abs(control) >= 30 ? "HIGH" : "MEDIUM"
    });
  }

  // ---------------- VOLATILITY SPIKE ----------------
  if (volatility >= 25) {
    signals.push({
      type: "VOLATILITY_SPIKE",
      severity: volatility >= 40 ? "HIGH" : "MEDIUM"
    });
  }

  return signals;
}