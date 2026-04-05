import {
  LEAGUE_SEEDS as ALL_LEAGUE_SEEDS
} from "../workers/_shared/leagues-coverage.js";

import {
  LEAGUE_NAME_MAP,
  leagueName,
  isKnownLeague,
  isUEFACompetition,
  normalizeSeason
} from "../workers/_shared/leagues-registry.js";

export const ATHENS_TZ = "Europe/Athens";

export const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

export const ACTIVE_INGEST_SEEDS = ALL_LEAGUE_SEEDS;

export const LEAGUE_SEEDS = ACTIVE_INGEST_SEEDS;

export {
  ALL_LEAGUE_SEEDS,
  LEAGUE_NAME_MAP,
  leagueName,
  isKnownLeague,
  isUEFACompetition,
  normalizeSeason
};