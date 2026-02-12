export function strengthModel(data) {
  const { standings } = data;

  if (!standings) {
    return {
      baseEdgeHome: 0.5,
      baseEdgeAway: 0.5,
      stabilityIndex: 0.5
    };
  }

  const gdH = standings.home?.goalDiff || 0;
  const gdA = standings.away?.goalDiff || 0;

  const total = Math.abs(gdH) + Math.abs(gdA) + 1;
  const baseEdgeHome = (gdH + total) / (2 * total);

  return {
    baseEdgeHome,
    baseEdgeAway: 1 - baseEdgeHome,
    stabilityIndex: Math.min(1, Math.abs(gdH - gdA) / 20)
  };
}