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
