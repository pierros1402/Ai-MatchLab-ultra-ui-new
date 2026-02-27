export function computeDrift(baseline, live) {

  if (!baseline || !live) return null;

  const tempo = (live.tempo ?? 0) - (baseline.tempo ?? 0);
  const volatility = (live.volatility ?? 0) - (baseline.volatility ?? 0);
  const control = (live.control ?? 0) - (baseline.control ?? 0);

  const magnitude =
    Math.abs(tempo) +
    Math.abs(volatility) +
    Math.abs(control);

  let regime = "STABLE";

  if (magnitude > 1.2) regime = "CHAOTIC";
  else if (magnitude > 0.6) regime = "TRANSITION";

  return {
    tempo: Number(tempo.toFixed(2)),
    volatility: Number(volatility.toFixed(2)),
    control: Number(control.toFixed(2)),
    magnitude: Number(magnitude.toFixed(2)),
    regime
  };
}