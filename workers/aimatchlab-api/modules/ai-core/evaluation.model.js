export function evaluateMatch(aiProfile, finalScoreHome, finalScoreAway) {

  const winner =
    finalScoreHome === finalScoreAway ? "draw" :
    finalScoreHome > finalScoreAway ? "home" : "away";

  const structuralHit =
    aiProfile?.scenario?.dominantBranch === winner ? 1 : 0;

  const totalGoals = finalScoreHome + finalScoreAway;
  const volatilityError =
    Math.abs((aiProfile?.risk?.volatilityIndex || 0.5) - Math.min(1, totalGoals / 5));

  const comebackOccurred =
    (winner === "home" && finalScoreHome < finalScoreAway) ||
    (winner === "away" && finalScoreAway < finalScoreHome);

  const comebackCorrect =
    comebackOccurred && (aiProfile?.risk?.comebackProbability || 0) > 0.4;

  const confidenceCalibrationScore =
    1 - Math.abs((aiProfile?.confidence || 0.5) - structuralHit);

  const overallGrade =
    (structuralHit * 0.4) +
    ((1 - volatilityError) * 0.3) +
    (confidenceCalibrationScore * 0.3);

  return {
    structuralHit,
    volatilityError,
    comebackCorrect,
    confidenceCalibrationScore,
    overallGrade: Number(overallGrade.toFixed(3))
  };
}