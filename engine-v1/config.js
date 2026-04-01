import {
  LEAGUE_SEEDS as ALL_LEAGUE_SEEDS,
  LEAGUE_NAME_MAP,
  leagueName,
  isKnownLeague,
  isUEFACompetition,
  normalizeSeason
} from "../workers/_shared/leagues-registry.js";

export const ATHENS_TZ = "Europe/Athens";

export const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

export const ACTIVE_INGEST_SEEDS = [
  // England (μέχρι National League)
  "eng.1",
  "eng.2",
  "eng.3",
  "eng.4",
  "eng.5",

  // Spain
  "esp.1",
  "esp.2",

  // Italy
  "ita.1",
  "ita.2",

  // Germany (μέχρι 3. Liga)
  "ger.1",
  "ger.2",

  // France
  "fra.1",

  // Core Europe
  "ned.1",
  "por.1",
  "bel.1",

  // Local interest
  "gre.1",
  "cyp.1",

  // UEFA
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf"
];

export const LEAGUE_SEEDS = ACTIVE_INGEST_SEEDS;

export {
  ALL_LEAGUE_SEEDS,
  LEAGUE_NAME_MAP,
  leagueName,
  isKnownLeague,
  isUEFACompetition,
  normalizeSeason
};