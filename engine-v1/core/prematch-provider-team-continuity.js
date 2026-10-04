// A model-only identity read view. No aliases, global IDs, canonical fixtures,
// or historical prediction files are changed by this module.
export function applyProviderTeamContinuity(validated, anchors, nowMs) {
  const targets = new Map(), targetNames = new Map(), oldNames = new Map(), proofs = new Map();
  const token = value => /^[a-zA-Z0-9]{6,16}$/.test(value || "");
  const add = (map, key, value) => { const set = map.get(key) || new Set(); set.add(value); map.set(key, set); };
  const addTarget = (leagueSlug, nativeId, name, globalClubId) => {
    add(targets, `${leagueSlug}|${nativeId}`, JSON.stringify({ name, globalClubId: globalClubId || null }));
    add(targetNames, `${leagueSlug}|${name}`, nativeId);
  };
  // Already verified recent finals can anchor the current spelling too. This
  // keeps the read view useful after kickoff, without depending on another
  // future fixture being in the canonical universe yet.
  for (const { candidate, row } of validated) {
    const time = Date.parse(row.kickoff || row.kickoffUtc);
    if (row.source !== "prematch_exact_verified_final" || row.truthContract?.verifiedFinalTruth !== true
      || !Number.isFinite(time) || time >= nowMs || time < nowMs - 180 * 86400000
      || candidate.home !== row.homeTeam || candidate.away !== row.awayTeam
      || !token(candidate.homeProviderTeamId) || !token(candidate.awayProviderTeamId)
      || candidate.homeProviderTeamId === candidate.awayProviderTeamId) continue;
    for (const side of ["home", "away"]) addTarget(row.leagueSlug, candidate[`${side}ProviderTeamId`], row[`${side}Team`], row[`${side}GlobalClubId`]);
  }
  for (const { candidate, canonical } of anchors) {
    const time = Date.parse(candidate.kickoffUtc);
    // Kickoff does not invalidate an exact team identity. Retain recent fixture
    // anchors for eight days; their scores never enter form via this path.
    if (!canonical || !Number.isFinite(time) || time < nowMs - 8 * 86400000 || time > nowMs + 8 * 86400000
      || canonical.hasConflict === true || canonical.leagueSlug !== candidate.leagueSlug
      || Date.parse(canonical.kickoffUtc) !== time || canonical.homeTeam !== candidate.home || canonical.awayTeam !== candidate.away) continue;
    const ids = [canonical.providerIds?.flashscore, canonical.source === "flashscore" ? canonical.sourceMatchId || canonical.sourceId : null].filter(Boolean);
    if (!ids.length || ids.some(id => id !== candidate.providerMatchId)) continue;
    if (!token(candidate.homeProviderTeamId) || !token(candidate.awayProviderTeamId) || candidate.homeProviderTeamId === candidate.awayProviderTeamId) continue;
    for (const side of ["home", "away"]) {
      const nativeId = candidate[`${side}ProviderTeamId`], name = canonical[`${side}Team`];
      addTarget(canonical.leagueSlug, nativeId, name, canonical[`${side}GlobalClubId`]);
    }
  }
  for (const { candidate, row } of validated) for (const side of ["home", "away"]) {
    const nativeId = candidate[`${side}ProviderTeamId`];
    if (!token(nativeId)) continue;
    const oldName = row[`${side}Team`], key = `${row.leagueSlug}|${nativeId}`;
    add(oldNames, `${row.leagueSlug}|${oldName}`, nativeId);
    const choices = targets.get(key);
    if (choices?.size !== 1) continue;
    const target = JSON.parse([...choices][0]);
    if (target.name === oldName || candidate[side] !== target.name || targetNames.get(`${row.leagueSlug}|${target.name}`)?.size !== 1) continue;
    const oldGlobalId = row[`${side}GlobalClubId`] || null;
    if (oldGlobalId !== target.globalClubId) continue; // Includes managed/unmanaged ambiguity.
    const proofKey = `${key}|${oldName}|${target.name}`;
    const proof = proofs.get(proofKey) || { leagueSlug: row.leagueSlug, providerTeamId: nativeId, from: oldName, to: target.name, globalClubId: oldGlobalId,
      providerMatchIds: new Set(), days: new Set(), canonicalIds: new Set() };
    proof.providerMatchIds.add(candidate.providerMatchId); proof.days.add(row.dayKey); proof.canonicalIds.add(row.id);
    proofs.set(proofKey, proof);
  }
  const accepted = [...proofs.entries()].filter(([, proof]) => proof.providerMatchIds.size >= 2 && proof.days.size >= 2
    && oldNames.get(`${proof.leagueSlug}|${proof.from}`)?.size === 1);
  const mapping = new Map(accepted.map(([key, proof]) => [key, proof]));
  const rows = validated.map(({ candidate, row }) => {
    const changes = [];
    const view = { ...row };
    for (const side of ["home", "away"]) {
      const key = `${row.leagueSlug}|${candidate[`${side}ProviderTeamId`]}|${row[`${side}Team`]}|${candidate[side]}`;
      const proof = mapping.get(key);
      if (proof?.canonicalIds.has(row.id)) {
        view[`${side}Team`] = proof.to;
        changes.push({ side, from: proof.from, to: proof.to, providerTeamId: proof.providerTeamId });
      }
    }
    if (changes.length) view.modelIdentityReadView = { schema: "ai-matchlab.provider-team-continuity.v1", changes,
      canonicalHomeTeam: row.homeTeam, canonicalAwayTeam: row.awayTeam, canonicalIdentityUnchanged: true };
    return view;
  });
  return { rows, proofs: accepted.map(([, proof]) => ({ ...proof, providerMatchIds: [...proof.providerMatchIds], days: [...proof.days], canonicalIds: [...proof.canonicalIds] })) };
}
