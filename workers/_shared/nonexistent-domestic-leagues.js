// Nonexistent domestic tiers; preserve historical identifiers without acquiring them.
// Sources: national football associations, checked 2026-11-26.
export const NONEXISTENT_DOMESTIC_LEAGUES = Object.freeze({
  "lie.1": "https://www.lfv.li/breitenfussball/vereinsfussball/erwachsenenfussball",
  "lie.2": "https://www.lfv.li/breitenfussball/vereinsfussball/erwachsenenfussball",
  "smr.2": "https://www.fsgc.sm/en/history"
});
export function isNonexistentDomesticLeague(slug) {
  return Object.hasOwn(NONEXISTENT_DOMESTIC_LEAGUES, String(slug || "").toLowerCase());
}

 // Separate scope exclusions: do not claim these competitions never existed.
export const OUT_OF_SCOPE_DOMESTIC_LEAGUES = Object.freeze({
  "can.2": "UNVERIFIED_SECOND_TIER_IDENTITY",
  "gib.2": "RESERVE_COMPETITION_SCOPE"
});
export function isExcludedDomesticLeague(slug) {
  return isNonexistentDomesticLeague(slug) ||
    Object.hasOwn(OUT_OF_SCOPE_DOMESTIC_LEAGUES, String(slug || "").toLowerCase());
}
