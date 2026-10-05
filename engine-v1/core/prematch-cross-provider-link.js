// Learn native team identity only from exact-provider, verified-final matches.
// Newly linked matches never become seeds during this pass.
const nameKey = name => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const token = value => /^[a-zA-Z0-9]{6,16}$/.test(value || "");

export function createPrematchCrossProviderLinker(verifiedSeeds) {
  const bindings = new Map(), reverse = new Map();
  for (const { candidate, row } of verifiedSeeds) {
    if (row.source !== "prematch_exact_verified_final" || row.truthContract?.verifiedFinalTruth !== true || row.providerIdentityLink) continue;
    if (!token(candidate.homeProviderTeamId) || !token(candidate.awayProviderTeamId) || candidate.homeProviderTeamId === candidate.awayProviderTeamId) continue;
    for (const side of ["home", "away"]) {
      const native = candidate[`${side}ProviderTeamId`], name = nameKey(row[`${side}Team`]);
      if (!name) continue;
      const key = `${row.leagueSlug}|${native}|${name}`;
      const binding = bindings.get(key) || { canonicalIds: new Set(), days: new Set(), providerMatchIds: new Set(), globalIds: new Set() };
      binding.canonicalIds.add(row.id); binding.days.add(row.dayKey); binding.providerMatchIds.add(candidate.providerMatchId);
      binding.globalIds.add(row[`${side}GlobalClubId`] || null); bindings.set(key, binding);
      const reverseKey = `${row.leagueSlug}|${name}`, natives = reverse.get(reverseKey) || new Set();
      natives.add(native); reverse.set(reverseKey, natives);
    }
  }
  return (candidate, canonical) => {
    if (canonical.hasConflict === true || canonical.leagueSlug !== candidate.leagueSlug
      || Date.parse(canonical.kickoffUtc) !== Date.parse(candidate.kickoffUtc)) return null;
    if (canonical.providerIds?.flashscore || canonical.source === "flashscore") return null;
    const espnIds = [canonical.providerIds?.espn, canonical.source === "espn" ? canonical.sourceMatchId || canonical.sourceId : null].filter(Boolean).map(String);
    if (!espnIds.length || !espnIds.every(id => /^\d+$/.test(id) && id === espnIds[0])) return null;
    if (!token(candidate.providerMatchId) || !token(candidate.homeProviderTeamId) || !token(candidate.awayProviderTeamId)
      || candidate.homeProviderTeamId === candidate.awayProviderTeamId) return null;
    const sides = {};
    for (const side of ["home", "away"]) {
      const native = candidate[`${side}ProviderTeamId`], name = nameKey(canonical[`${side}Team`]);
      const binding = bindings.get(`${canonical.leagueSlug}|${native}|${name}`);
      if (!binding || binding.canonicalIds.size < 2 || binding.days.size < 2 || binding.providerMatchIds.size < 2
        || reverse.get(`${canonical.leagueSlug}|${name}`)?.size !== 1 || binding.globalIds.size !== 1
        || !binding.globalIds.has(canonical[`${side}GlobalClubId`] || null)) return null;
      sides[side] = { providerTeamId: native, canonicalTeam: canonical[`${side}Team`],
        canonicalIds: [...binding.canonicalIds].sort(), days: [...binding.days].sort(), providerMatchIds: [...binding.providerMatchIds].sort() };
    }
    return { schema: "ai-matchlab.verified-provider-identity-link.v1", canonicalId: canonical.canonicalId,
      providerMatchId: candidate.providerMatchId, espnMatchId: espnIds[0], leagueSlug: canonical.leagueSlug,
      kickoffUtc: canonical.kickoffUtc, sides, canonicalIdentityUnchanged: true };
  };
}
