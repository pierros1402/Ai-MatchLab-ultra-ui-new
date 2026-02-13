export function consistencyModel(data) {

  const standings = data.standings;

  if (!standings || !standings.home || !standings.away) {
    return {
      formMomentumIndex: 0.5,
      defensiveStabilityIndex: 0.5,
      scoringReliabilityIndex: 0.5,
      varianceScore: 0.5
    };
  }

  const h = standings.home;
  const a = standings.away;

  const homeScoring = h.gf / Math.max(1, h.p);
  const awayScoring = a.gf / Math.max(1, a.p);

  const homeConceding = h.ga / Math.max(1, h.p);
  const awayConceding = a.ga / Math.max(1, a.p);

  const scoringReliabilityIndex =
    Math.min(1, (homeScoring + awayScoring) / 4);

  const defensiveStabilityIndex =
    1 - Math.min(1, (homeConceding + awayConceding) / 4);

  const formMomentumIndex =
    Math.min(1, (h.pts + a.pts) / Math.max(6, (h.p + a.p) * 3));

  const varianceScore =
    Math.abs(homeScoring - awayScoring) * 0.3 +
    Math.abs(homeConceding - awayConceding) * 0.3;

  return {
    formMomentumIndex,
    defensiveStabilityIndex,
    scoringReliabilityIndex,
    varianceScore
  };
}