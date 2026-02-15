
// ============================================================
// AIMATCHLAB — AI TIER CONFIG (ESPN-BASED PRODUCTION)
// Deterministic league tiering based ONLY on active ESPN slugs
// ============================================================

const TIER_1 = new Set([
  "eng.1",
  "esp.1",
  "ita.1",
  "ger.1",
  "fra.1"
]);

const TIER_2 = new Set([
  // England depth
  "eng.2",
  "eng.3",
  "eng.4",

  // Germany depth
  "ger.2",
  "ger.3",

  // Major secondary divisions
  "esp.2",
  "ita.2",
  "fra.2",

  // Western / Central Europe top tiers
  "ned.1",
  "por.1",
  "bel.1",
  "tur.1"
]);

const TIER_3 = new Set([
  "gre.1",
  "aut.1",
  "sco.tennents",
  "ned.2"
]);

// Everything else from ESPN feed automatically becomes Tier 4

export function getLeagueTier(slug) {
  if (!slug) return 4;
  if (TIER_1.has(slug)) return 1;
  if (TIER_2.has(slug)) return 2;
  if (TIER_3.has(slug)) return 3;
  return 4;
}

export function getLeagueWeight(slug) {
  const tier = getLeagueTier(slug);

  switch (tier) {
    case 1: return 1.0;
    case 2: return 0.8;
    case 3: return 0.6;
    default: return 0.35;
  }
}

export function isAiEligibleLeague(slug) {
  // Tier 4 still allowed but low weight
  return !!slug;
}

export function getTierMeta(slug) {
  const tier = getLeagueTier(slug);
  return {
    tier,
    weight: getLeagueWeight(slug),
    elite: tier === 1,
    deep: tier === 2
  };
}
