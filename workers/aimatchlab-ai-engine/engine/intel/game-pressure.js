// ============================================================
// GAME PRESSURE ENGINE
// Detects late pressure and comeback dynamics
// ============================================================

export function detectGamePressure(intel) {

  if (!intel) return null;

  const minute =
    Number(intel?.basic?.minute ??
           intel?.basic?.clock ??
           0);

  const scoreHome =
    Number(intel?.basic?.scoreHome ?? 0);

  const scoreAway =
    Number(intel?.basic?.scoreAway ?? 0);

  const volatility =
    Number(intel?.metrics?.volatility ?? 0);

  const tempo =
    Number(intel?.metrics?.tempo ?? 0);

  const control =
    Number(intel?.metrics?.control ?? 0);

  const phase =
    String(intel?.meta?.phase ?? "PRE");

  if (phase !== "LIVE") {
    return null;
  }

  const goalDiff =
    scoreHome - scoreAway;

  let pressureType = "NONE";
  let side = "NONE";

  // ------------------------------------------------------------
  // LATE PRESSURE
  // ------------------------------------------------------------

  if (minute >= 70) {

    if (goalDiff === 0 && tempo > 0.5 && volatility > 0.5) {
      pressureType = "LATE_BREAKTHROUGH";
    }

    if (goalDiff === -1 && tempo > 0.4) {
      pressureType = "HOME_CHASING";
      side = "HOME";
    }

    if (goalDiff === 1 && tempo > 0.4) {
      pressureType = "AWAY_CHASING";
      side = "AWAY";
    }
  }

  // ------------------------------------------------------------
  // MID GAME PRESSURE
  // ------------------------------------------------------------

  if (minute >= 45 && minute < 70) {

    if (goalDiff === -1 && control < 0.4 && tempo > 0.5) {
      pressureType = "HOME_BUILDING_PRESSURE";
      side = "HOME";
    }

    if (goalDiff === 1 && control < 0.4 && tempo > 0.5) {
      pressureType = "AWAY_BUILDING_PRESSURE";
      side = "AWAY";
    }
  }

  if (pressureType === "NONE") {
    return null;
  }

  // ------------------------------------------------------------
  // PRESSURE SCORE
  // ------------------------------------------------------------

  const pressureScore =
    Math.max(0,
      Math.min(1,
        (tempo + volatility + (1 - control)) / 3
      )
    );

  return {
    type: pressureType,
    side,
    minute,
    score: Number(pressureScore.toFixed(3))
  };
}