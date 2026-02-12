export function computeCoverage(data) {
  const hasStandings = !!data.standings;
  const hasLive = !!data.live;

  const score =
      0.4 * (hasStandings ? 1 : 0)
    + 0.4 * (hasLive ? 1 : 0)
    + 0.2;

  let level = "baseline";
  if (score >= 0.8) level = "full";
  else if (score >= 0.5) level = "structural";

  return { score, level };
}