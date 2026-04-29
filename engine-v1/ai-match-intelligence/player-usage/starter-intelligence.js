export function buildStarterIntelligence(playerUsage = {}) {
  const matches = Array.isArray(playerUsage?.matches)
    ? playerUsage.matches
    : [];

  const lastMatches = matches.slice(-5); // last 5

  const starterCount = new Map();

  for (const match of lastMatches) {
    for (const p of match.players || []) {
      if (!p?.starter) continue;

      const name = p.name;
      if (!name) continue;

      starterCount.set(name, (starterCount.get(name) || 0) + 1);
    }
  }

  const sorted = Array.from(starterCount.entries())
    .sort((a, b) => b[1] - a[1]);

  const expectedStarters = sorted
    .filter(([_, count]) => count >= 1)
    .map(([name]) => name);

  return {
    matchSampleSize: lastMatches.length,
    expectedStarters,
    starterFrequency: Object.fromEntries(starterCount)
  };
}