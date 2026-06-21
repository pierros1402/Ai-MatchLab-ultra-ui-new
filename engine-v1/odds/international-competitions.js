/**
 * international-competitions.js
 *
 * Maps a BetExplorer competition label ("World: World Championship 2026",
 * "Europe: Champions League Qualifying", …) to one of our international slugs.
 * These are the competitions that don't live in a single domestic standings
 * table — the World Cup, continental qualifiers and the UEFA club-cup
 * qualifying rounds the user asked to include.
 *
 * `type`:
 *   "national" → teams are national sides (no club standings; AI assessment skipped)
 *   "club"     → teams are clubs from various domestic leagues (assessment can use
 *                each team's own league standings)
 */

const RULES = [
  // FIFA World Cup (the 2026 finals, currently in progress) + qualifiers
  { re: /world\s*cup\s*qualif|world\s*championship\s*qualif|wc\s*qualif/i, slug: "fifa.world_cup_qual", label: "World Cup Qualification", type: "national" },
  { re: /world\s*cup|world\s*championship/i, slug: "fifa.world_cup", label: "FIFA World Cup", type: "national" },

  // UEFA national-team competitions
  { re: /european\s*championship\s*qualif|euro\s*qualif/i, slug: "uefa.euro_qual", label: "Euro Qualification", type: "national" },
  { re: /nations\s*league/i, slug: "uefa.nations_league", label: "UEFA Nations League", type: "national" },

  // UEFA club-cup qualifying rounds (European cups' qualifiers)
  { re: /champions\s*league\s*(qualif|qual\b|playoff|prelim)/i, slug: "uefa.champions_qual", label: "Champions League Qualifying", type: "club" },
  { re: /europa\s*league\s*(qualif|qual\b|playoff|prelim)/i, slug: "uefa.europa_qual", label: "Europa League Qualifying", type: "club" },
  { re: /(europa\s*)?conference\s*league\s*(qualif|qual\b|playoff|prelim)/i, slug: "uefa.conference_qual", label: "Conference League Qualifying", type: "club" },

  // Other continental national-team finals (handy while in WC/qualifier season)
  { re: /copa\s*am[eé]rica/i, slug: "conmebol.copa_america", label: "Copa América", type: "national" },
  { re: /africa(n)?\s*cup\s*of\s*nations|cup\s*of\s*nations/i, slug: "caf.afcon", label: "Africa Cup of Nations", type: "national" },
  { re: /asian\s*cup/i, slug: "afc.asian_cup", label: "AFC Asian Cup", type: "national" }
];

/**
 * @param {string} competition  BetExplorer competition name (without country prefix)
 * @param {string} [country]    the country prefix (e.g. "World", "Europe")
 * @returns {{slug,label,type}|null}
 */
export function resolveInternational(competition, country) {
  const text = `${country || ""} ${competition || ""}`.trim();
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.re.test(text)) return { slug: rule.slug, label: rule.label, type: rule.type };
  }
  return null;
}
