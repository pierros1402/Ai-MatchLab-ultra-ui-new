// Learn native team identity only from exact-provider, verified-final matches.
// Newly linked matches never become seeds during this pass.
const nameKey = name => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const token = value => /^[a-zA-Z0-9]{6,16}$/.test(value || "");

export function createPrematchCrossProviderLinker(verifiedSeeds, {
  seedSource = "prematch_exact_verified_final", excludeCurrentMatch = false, requireExactNames = false
} = {}) {
  const bindings = new Map(), reverse = new Map();
  for (const { candidate, row } of verifiedSeeds) {
    if (row.source !== seedSource || row.truthContract?.verifiedFinalTruth !== true || row.providerIdentityLink) continue;
    if (!token(candidate.homeProviderTeamId) || !token(candidate.awayProviderTeamId) || candidate.homeProviderTeamId === candidate.awayProviderTeamId) continue;
    for (const side of ["home", "away"]) {
      const native = candidate[`${side}ProviderTeamId`], name = nameKey(row[`${side}Team`]);
      if (!name) continue;
      const key = `${row.leagueSlug}|${native}|${name}`;
      const binding = bindings.get(key) || { canonicalIds: new Set(), days: new Set(), providerMatchIds: new Set(), globalIds: new Set(), evidence: [] };
      binding.canonicalIds.add(row.id); binding.days.add(row.dayKey); binding.providerMatchIds.add(candidate.providerMatchId);
      binding.globalIds.add(row[`${side}GlobalClubId`] || null);
      binding.evidence.push({ canonicalId: row.id, day: row.dayKey, providerMatchId: candidate.providerMatchId, espnMatchId: row.identitySeedEspnMatchId || null });
      bindings.set(key, binding);
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
    if (requireExactNames && (nameKey(candidate.home) !== nameKey(canonical.homeTeam) || nameKey(candidate.away) !== nameKey(canonical.awayTeam))) return null;
    const sides = {};
    for (const side of ["home", "away"]) {
      const native = candidate[`${side}ProviderTeamId`], name = nameKey(canonical[`${side}Team`]);
      const binding = bindings.get(`${canonical.leagueSlug}|${native}|${name}`);
      if (!binding || reverse.get(`${canonical.leagueSlug}|${name}`)?.size !== 1 || binding.globalIds.size !== 1
        || !binding.globalIds.has(canonical[`${side}GlobalClubId`] || null)) return null;
      const evidence = binding.evidence.filter(row => !excludeCurrentMatch ||
        row.canonicalId !== canonical.canonicalId && row.providerMatchId !== candidate.providerMatchId && row.espnMatchId !== espnIds[0]);
      const canonicalIds = [...new Set(evidence.map(row => row.canonicalId))].sort();
      const days = [...new Set(evidence.map(row => row.day))].sort();
      const providerMatchIds = [...new Set(evidence.map(row => row.providerMatchId))].sort();
      if (canonicalIds.length < 2 || days.length < 2 || providerMatchIds.length < 2) return null;
      sides[side] = { providerTeamId: native, canonicalTeam: canonical[`${side}Team`], canonicalIds, days, providerMatchIds };
    }
    return { schema: "ai-matchlab.verified-provider-identity-link.v1", canonicalId: canonical.canonicalId,
      providerMatchId: candidate.providerMatchId, espnMatchId: espnIds[0], leagueSlug: canonical.leagueSlug,
      kickoffUtc: canonical.kickoffUtc, sides, canonicalIdentityUnchanged: true,
      ...(requireExactNames && excludeCurrentMatch ? { evidencePolicy: "exact_names_and_two_other_original_verified_finals", currentMatchExcludedFromSeeds: true } : {}) };
  };
}
