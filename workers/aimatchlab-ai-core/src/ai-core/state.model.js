export function stateModel(data, coverage) {
  if (!data.live || coverage.level === "baseline") {
    return {
      tempoIndex: null,
      controlDelta: null,
      threatDelta: null
    };
  }

  const shotsH = data.live.home?.shots || 0;
  const shotsA = data.live.away?.shots || 0;

  const controlDelta = shotsH - shotsA;
  const tempoIndex = Math.min(100, (shotsH + shotsA) * 5);

  return {
    tempoIndex,
    controlDelta,
    threatDelta: controlDelta * 1.2
  };
}