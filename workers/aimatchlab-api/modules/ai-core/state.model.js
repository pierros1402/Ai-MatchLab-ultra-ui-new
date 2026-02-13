export function stateModel(data, coverage) {

  const live = data.live || data.core.liveStats || null;

  if (!live) {
    return {
      tempoIndex: null,
      controlDelta: null,
      threatDelta: null,
      dominanceType: "none"
    };
  }

  const shotsDiff =
    (live.shotsHome || 0) - (live.shotsAway || 0);

  const shotsOnTargetDiff =
    (live.shotsOnTargetHome || 0) - (live.shotsOnTargetAway || 0);

  const possessionDiff =
    (live.possessionHome || 0) - (live.possessionAway || 0);

  const tempoIndex = Math.min(
    100,
    ((live.shotsHome || 0) + (live.shotsAway || 0)) * 4 +
    ((live.cornersHome || 0) + (live.cornersAway || 0)) * 2
  );

  const controlDelta =
    shotsDiff * 2 +
    possessionDiff * 0.3;

  const threatDelta =
    shotsOnTargetDiff * 4 +
    shotsDiff * 1.5;

  let dominanceType = "balanced";

  if (Math.abs(controlDelta) > 15 && Math.abs(threatDelta) < 5) {
    dominanceType = "false_control";
  } else if (Math.abs(threatDelta) > 10) {
    dominanceType = "real_pressure";
  }

  return {
    tempoIndex,
    controlDelta,
    threatDelta,
    dominanceType
  };
}