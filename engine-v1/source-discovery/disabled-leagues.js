/**
 * disabled-leagues.js
 *
 * Leagues that stay on the coverage map but are DEACTIVATED: no search/research, no
 * standings/history acquisition, no results attribution — nothing is fetched for
 * them anywhere. Tiny no-data-source competitions (Caribbean / Pacific / a few
 * others) the user explicitly does not want us spending any work on.
 *
 * Disabled by COUNTRY code (slug prefix before the dot), so all divisions go too.
 */

const DISABLED_COUNTRIES = new Set([
  // Caribbean
  "aia", "atg", "aru", "bah", "brb", "blz", "ber", "vgb", "cay", "cub", "cuw",
  "dma", "grn", "hai", "msr", "pur", "skn", "lca", "vin", "sur", "tri", "vir",
  // Pacific
  "fij", "asa", "cok", "ncl", "png", "sam", "tah", "tga",
  // small Africa
  "mad", "mri",
  // explicitly excluded by the user
  "afg", "ple", "sri"
]);

export function isDisabledLeague(slug) {
  const country = String(slug || "").split(".")[0].toLowerCase();
  return DISABLED_COUNTRIES.has(country);
}

export { DISABLED_COUNTRIES };
