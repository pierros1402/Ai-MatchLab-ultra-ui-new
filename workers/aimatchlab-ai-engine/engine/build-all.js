import { buildSeason } from "./season-builder.js";

const LEAGUES = [
  "eng.1",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1",
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf"
];

export async function buildAll(env, season) {
  const results = [];

  for (const league of LEAGUES) {
    try {
      const res = await buildSeason(env, league, season);
      results.push({
        league,
        matchesStored: res.matchesStored
      });
    } catch {
      results.push({
        league,
        error: true
      });
    }
  }

  return {
    ok: true,
    season,
    leaguesProcessed: LEAGUES.length,
    results
  };
}