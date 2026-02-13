export function identityModel(data, coverage) {
  const { standings } = data;

  if (!standings) {
    return {
      matchImportance: 0.5,
      urgencyHome: 0.5,
      urgencyAway: 0.5
    };
  }

  const diff = Math.abs((standings.home?.points || 0) - (standings.away?.points || 0));
  const urgency = 1 / (1 + diff);

  return {
    matchImportance: coverage.score,
    urgencyHome: urgency,
    urgencyAway: urgency
  };
}