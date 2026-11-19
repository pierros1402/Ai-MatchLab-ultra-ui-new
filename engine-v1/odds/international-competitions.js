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
  { re: /world\s*cup|world\s*championship/i, slug: "fifa.world", label: "FIFA World Cup", type: "national" },

  // UEFA national-team competitions
  { re: /european\s*championship\s*qualif|euro\s*qualif/i, slug: "uefa.euro_qual", label: "Euro Qualification", type: "national" },

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
 * Nations League is not an identity: the confederation and provider path must
 * agree before we allow the existing UEFA mapping. All other Nations League
 * records are held; CONCACAF admission belongs to the competition registry.
 * Do not use club-name similarity or a generic domestic fallback.
 */
export function nationsLeagueRoutingDecision(competition, country, leaguePath = null) {
  const label = String(competition ?? "").trim();
  const region = String(country ?? "").trim();
  const providerPath = String(leaguePath ?? "").trim().toLowerCase();
  const combined = `${region} ${label}`;
  if (!/\bnations[\s-]*league\b/i.test(combined)) {
    if (/nations[-_]league/i.test(providerPath)) return { kind: "hold", reason: "competition_label_path_disagreement" };
    return { kind: "other" };
  }

  // Provider path must identify the ACTUAL competition, not just /football/europe/.
  const exactUefaPath = /^\/football\/europe\/uefa-nations-league\/?$/i.test(providerPath);
  const clearlyOtherPath = providerPath !== "" && !exactUefaPath;
  const explicitUefa = /\buefa\b/i.test(label);
  const explicitOther = /\bconcacaf\b|\bconmebol\b|\bafc\b|\bcaf\b|\bofc\b/i.test(combined)
    || /north\s*(?:&|and|-)\s*central\s*america|\bafrica\b|\basia\b|\bsouth america\b/i.test(combined);
  const regionConflict = /north\s*(?:&|and|-)\s*central\s*america|\bafrica\b|\basia\b|\bsouth america\b/i.test(region);

  if (explicitOther || regionConflict || (explicitUefa && clearlyOtherPath)) {
    return {kind:"hold", reason:"nations_league_conflicting_or_non_uefa_provenance"};
  }
  if (exactUefaPath) {
    return {kind:"resolved", slug:"uefa.nations", label:"UEFA Nations League", type:"national"};
  }
  return {kind:"hold", reason:"nations_league_confederation_unverified"};
}

/**
 * @param {string} competition  BetExplorer competition name (without country prefix)
 * @param {string} [country]    the country prefix (e.g. "World", "Europe")
 * @returns {{slug,label,type}|null}
 */
export function resolveInternational(competition, country, leaguePath = null) {
  const text = `${country || ""} ${competition || ""}`.trim();
  if (!text) return null;
  const routing = nationsLeagueRoutingDecision(competition, country, leaguePath);
  if (routing.kind === "hold") return null;
  if (routing.kind === "resolved") return {
    slug: routing.slug, label: routing.label, type: routing.type
  };
  for (const rule of RULES) {
    if (rule.re.test(text)) return { slug: rule.slug, label: rule.label, type: rule.type };
  }
  return null;
}
