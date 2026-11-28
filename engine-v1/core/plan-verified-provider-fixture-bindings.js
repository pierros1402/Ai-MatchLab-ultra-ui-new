import { athensDayFromKickoff } from "./daykey.js";
const text = v => String(v ?? "").trim();
const cid = c => text(c.canonicalId || c.matchId);
const token = v => /^[a-zA-Z0-9]{6,16}$/.test(v || "");
const unique = a => new Set(Array.isArray(a) ? a : []).size;

export function planVerifiedProviderFixtureBindings({ canonicalFixtures = [], audit, discovery } = {}) {
  if (audit?.schema !== "ai-matchlab.r04-existing-verified-provider-binding-audit.v1" ||
    audit.policy !== "existing_two_original_verified_finals_no_seed_propagation" ||
    !/^[a-f0-9]{40}$/.test(audit.sourceSha || "") || !Number.isFinite(Date.parse(audit.generatedAt)))
    throw new Error("verified_binding_audit_contract_required");
  const result = canonicalFixtures.map(c => ({ ...c })), changes = [], rejected = [];
  const proposals = audit.proposals || [];
  const reject = (p, reason) => rejected.push({ canonicalId: p.canonicalId, providerFixtureId: p.providerFixtureId, reason });
  const find = p => result.filter(c => cid(c) === p.canonicalId);
  for (const p of proposals) {
    const matches = find(p), proof = p.proof;
    if (matches.length !== 1 || proposals.filter(other => other.canonicalId === p.canonicalId ||
      other.providerFixtureId === p.providerFixtureId).length !== 1) { reject(p, "ambiguous_binding_claim"); continue; }
    const c = matches[0];
    const espnIds = [c.providerIds?.espn,
      ...(c.source === "espn" ? [c.sourceId, c.sourceMatchId] : [])].map(text).filter(Boolean);
    if (!proof || proof.schema !== "ai-matchlab.verified-provider-identity-link.v1" ||
      proof.canonicalIdentityUnchanged !== true || proof.canonicalId !== cid(c) ||
      proof.providerMatchId !== p.providerFixtureId || !token(p.providerFixtureId) ||
      !espnIds.length || espnIds.some(id => !/^\d+$/.test(id) || id !== proof.espnMatchId) ||
      c.providerTeamIdentityConflict === true || c.hasConflict === true ||
      c.providerIds?.flashscore || c.source === "flashscore" ||
      c.leagueSlug !== p.leagueSlug || proof.leagueSlug !== c.leagueSlug ||
      !Number.isFinite(Date.parse(c.kickoffUtc)) || Date.parse(c.kickoffUtc) !== Date.parse(proof.kickoffUtc) ||
      c.dayKey !== audit.dayKey || athensDayFromKickoff(c.kickoffUtc) !== audit.dayKey) {
      reject(p, "current_fixture_evidence_conflict"); continue;
    }
    const sides = proof.sides;
    if (proof.canonicalProviderTeamIds && (!["home", "away"].every(side =>
      /^\d+$/.test(proof.canonicalProviderTeamIds[side] || "") &&
      proof.canonicalProviderTeamIds[side] === c.providerTeamIds?.espn?.[side]) ||
      proof.canonicalProviderTeamIds.home === proof.canonicalProviderTeamIds.away)) {
      reject(p, "contradictory_native_espn_side_identity"); continue;
    }
    if (!["home", "away"].every(side => {
      const s = sides?.[side];
      const exactCanonicalSide = s?.canonicalTeam === c[side + "Team"];
      const exactNativeEspnSide = /^\d+$/.test(proof.canonicalProviderTeamIds?.[side] || "") &&
        proof.canonicalProviderTeamIds[side] === c.providerTeamIds?.espn?.[side] &&
        proof.canonicalProviderTeamIds.home !== proof.canonicalProviderTeamIds.away;
      return s && token(s.providerTeamId) && (exactCanonicalSide || exactNativeEspnSide) &&
        unique(s.canonicalIds) >= 2 && unique(s.days) >= 2 && unique(s.providerMatchIds) >= 2 &&
        !s.canonicalIds.includes(cid(c)) && !s.providerMatchIds.includes(p.providerFixtureId);
    }) || sides.home.providerTeamId === sides.away.providerTeamId) {
      reject(p, "two_original_independent_final_seeds_required"); continue;
    }
    const pair = { home: sides.home.providerTeamId, away: sides.away.providerTeamId };
    if (c.providerTeamIds?.flashscore || c.providerIdentityLink) { reject(p, "existing_identity_must_not_be_overwritten"); continue; }
    c.providerIds = { ...c.providerIds, flashscore: p.providerFixtureId };
    c.providerTeamIds = { ...c.providerTeamIds, flashscore: pair };
    c.providerIdentityLink = proof;
    c.providerFixtureBindingEvidence = { schema: "ai-matchlab.r04-provider-fixture-binding-evidence.v1",
      auditSourceSha: audit.sourceSha, auditedAt: audit.generatedAt, discoveryHash: audit.discoveryHash,
      policy: audit.policy };
    changes.push({ canonicalId: cid(c), providerFixtureId: p.providerFixtureId, type: "verified_fixture_binding" });
  }
  for (const p of audit.existingBindingAliasEvidence || []) {
    if (!p.exactKickoff || !["home", "away"].every(side => {
      const s = p.sides?.[side];
      return s?.sameApprovedGlobalClub === true && s.canonicalTeam?.ok === true && s.providerTeam?.ok === true &&
        s.canonicalTeam.fuzzyMatchingAttempted === false && s.providerTeam.fuzzyMatchingAttempted === false &&
        /^gcid_[a-f0-9]{24}$/.test(s.canonicalTeam.globalClubId || "") &&
        s.canonicalTeam.globalClubId === s.providerTeam.globalClubId;
    })) continue;
    if (p.sides.home.canonicalTeam.globalClubId === p.sides.away.canonicalTeam.globalClubId) continue;
    const matches = find(p), observed = (discovery?.fixtures || []).filter(f =>
      f.provider === "flashscore" && f.providerFixtureId === p.providerFixtureId);
    if (matches.length !== 1 || observed.length !== 1) { reject(p, "ambiguous_alias_native_binding"); continue; }
    const c = matches[0], f = observed[0];
    if (c.providerIds?.flashscore !== p.providerFixtureId || c.providerTeamIds?.flashscore ||
      c.providerTeamIdentityConflict === true || c.hasConflict === true ||
      (c.homeGlobalClubId && c.homeGlobalClubId !== p.sides.home.canonicalTeam.globalClubId) ||
      (c.awayGlobalClubId && c.awayGlobalClubId !== p.sides.away.canonicalTeam.globalClubId) ||
      c.leagueSlug !== p.leagueSlug || c.leagueSlug !== f.canonicalSlug ||
      c.dayKey !== audit.dayKey || f.dayKey !== audit.dayKey ||
      Date.parse(c.kickoffUtc) !== Date.parse(f.kickoffUtc) ||
      !token(f.home?.providerTeamId) || !token(f.away?.providerTeamId) ||
      f.home.providerTeamId === f.away.providerTeamId) { reject(p, "alias_current_fixture_conflict"); continue; }
    c.providerTeamIds = { ...c.providerTeamIds, flashscore: {
      home: f.home.providerTeamId, away: f.away.providerTeamId } };
    c.providerTeamIdentityEvidence = { ...c.providerTeamIdentityEvidence, flashscore: {
      schema: "ai-matchlab.approved-global-alias-native-identity.v1",
      providerFixtureId: p.providerFixtureId, auditSourceSha: audit.sourceSha, auditedAt: audit.generatedAt,
      discoveryHash: discovery.hash, observedAt: discovery.generatedAt,
      homeGlobalClubId: p.sides.home.canonicalTeam.globalClubId,
      awayGlobalClubId: p.sides.away.canonicalTeam.globalClubId,
      approvedAliasProof: p.sides, canonicalTruthUnchanged: true
    } };
    changes.push({ canonicalId: cid(c), providerFixtureId: p.providerFixtureId, type: "approved_alias_native_pair" });
  }
  return { fixtures: result, changes, rejected };
}
