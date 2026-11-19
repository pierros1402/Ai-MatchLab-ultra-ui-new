/**
 * Strict, read-only publication eligibility for model assessments.
 * This is NOT a provider identity crosswalk or permission to rewrite truth.
 * Fail closed on conflicting identity; quarantine insufficient evidence.
 * Retain original odds/market rows outside this module.
 */
const value = x => String(x ?? '').trim();
const team = (row, side) => {
  const raw = side === 'home' ? row?.homeTeam ?? row?.home : row?.awayTeam ?? row?.away;
  return typeof raw === 'string' ? value(raw) : value(raw?.name ?? raw?.displayName ?? raw?.shortName);
};
const date = x => {
  const s=value(x?.kickoffUtc ?? x?.kickoff ?? x?.startTime ?? x?.dateUtc);
  const ms=Date.parse(s);
  return s && Number.isFinite(ms) ? ms : null;
};
const id = x => value(x?.canonicalId);
const approvedAlias = (fixture, cid) => Boolean(cid && Array.isArray(fixture?.canonicalAliases) && fixture.canonicalAliases.includes(cid));
const providers = x => Object.entries(x?.providerIds ?? {}).filter(([k,v])=>value(k)&&value(v)).map(([k,v])=>[value(k).toLowerCase(),value(v)]);
const hasModel = x => Boolean(x?.aiAssessment?.markets && typeof x.aiAssessment.markets==='object' && Object.keys(x.aiAssessment.markets).length);
const result=(status,reason,fixture=null)=>({status,reason,fixture});
export function assessPublicationIdentity(row,fixtures=[]) {
  if (!hasModel(row)) return result('not_model','no_assessment');
  const cid=id(row);
  const pid=providers(row);
  if (!cid && pid.length===0) return result('quarantine','missing_authoritative_identity');
  const candidates=[];
  for (const f of fixtures) {
    const fc=id(f);
    const direct=Boolean(cid && fc && cid===fc);
    const provider=pid.some(([key,p])=>value(f?.providerIds?.[key])===p);
    if (direct || provider || approvedAlias(f, cid)) candidates.push(f);
  }
  if (!candidates.length) return result('quarantine','no_canonical_match');
  if (candidates.length!==1) return result('hold','non_unique_canonical_identity');
  const f=candidates[0];
  // Distinct canonical IDs with only a provider match require explicit approved
  // alias evidence, otherwise the provider could be reused across events.
  if (cid && id(f) && cid!==id(f) && !approvedAlias(f, cid))
    return result('hold','canonical_id_conflict',f);
  for (const [key,p] of pid) {
    const fp=value(f?.providerIds?.[key]);
    if (fp && fp!==p) return result('hold','provider_id_conflict',f);
  }
  for (const field of ['leagueSlug','dayKey']) {
    if (value(row[field]) && value(f[field]) && value(row[field])!==value(f[field]))
      return result('hold',`${field}_conflict`,f);
  }
  for (const side of ['home','away']) {
    if (team(row,side) && team(f,side) && team(row,side)!==team(f,side))
      return result('hold',`${side}_team_conflict`,f);
    const key=side+'GlobalClubId';
    const a=value(row[key] ?? row.productionIdentityBinding?.[key]);
    const b=value(f[key] ?? f.productionIdentityBinding?.[key]);
    if (a&&b&&a!==b) return result('hold',`${side}_global_identity_conflict`,f);
  }
  const a=date(row), b=date(f);
  if (a!==null && b!==null && a!==b) return result('hold','kickoff_conflict',f);
  // An exact synthetic canonical ID is not independent proof of event ownership.
  // Require matching provider-scoped evidence on both sides. Do not confuse a
  // provider key with a provider's native event ID or use a name-only fallback.
  const sharedProviderProof = pid.some(([key, nativeId]) =>
    value(f?.providerIds?.[key]) === nativeId);
  if (!sharedProviderProof) return result('quarantine','provider_identity_not_corrobated',f);
  // Never elevate an uncorroborated name/alias match to certified model status.
  // Exact canonical identity must be corroborated by team, competition and time.
  if (!cid || !id(f) || (cid!==id(f) && !approvedAlias(f, cid))) return result('quarantine','canonical_id_not_corrobated',f);
  if (!value(row.leagueSlug)||!value(f.leagueSlug)||!team(row,'home')||!team(f,'home')||!team(row,'away')||!team(f,'away')||a===null||b===null)
    return result('quarantine','insufficient_source_evidence',f);
  return result('publish','exact_identity_corroborated',f);
}
export function classifyAssessmentPublication(rows=[],fixtures=[]) {
  const outcomes=(Array.isArray(rows)?rows:[]).map(row=>({row,...assessPublicationIdentity(row,fixtures)}));
  return {outcomes,holds:outcomes.filter(x=>x.status==='hold'),quarantined:outcomes.filter(x=>x.status==='quarantine'),publishable:outcomes.filter(x=>x.status==='publish')};
}
