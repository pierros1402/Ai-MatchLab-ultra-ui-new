const text = value => String(value ?? "").trim();
const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value));
// Legacy batches grant authority only when every exact other-day event was removed.
// Mixed batches require a per-event removal decision, never a batch-wide inference.
export function verifiedExactWrongDayFetches(day, leagueSlug, meta) {
 const r=meta?.exactEventSummaryReconciliation,p=r?.policy;
 if(meta?.requestedDayKey!==day||meta?.requestedLeagueSlug!==leagueSlug||
  meta?.acquisitionProvider!=="espn_direct_league_status"||
  p?.exactProviderIdOnly!==true||p?.authoritativeEventDayOnly!==true||
  p?.teamIdentityRequired!==true||p?.homeAwayOrientationRequired!==true||
  p?.crossDayStatusPromotion!==false||p?.heuristicFinalPromotion!==false)return null;
 const n=Number(r.candidates),matched=Number(r.wrongDayMatches),removed=Number(r.wrongDayRemovedRows),
 rejected=Number(r.wrongDayIdentityRejectedRows);
 if(![n,matched,removed,rejected].every(Number.isInteger)||n<matched||matched<0||removed<0||rejected<0||
  matched!==removed+rejected)return null;
 const slugs=new Set([leagueSlug,...(Array.isArray(meta.providerFetchSlugs)?meta.providerFetchSlugs:[])].map(text));
 const other=(Array.isArray(r.fetches)?r.fetches:[]).filter(f=>f?.ok===true&&f.kind==="other_day"&&
  !text(f.reason)&&/^\d+$/.test(text(f.providerMatchId))&&slugs.has(text(f.providerSlug))&&
  isDay(f.authoritativeDayKey)&&f.authoritativeDayKey!==day);
 if(other.length!==matched||new Set(other.map(f=>text(f.providerMatchId))).size!==matched)return null;
 if(r.removalEvidenceSchema!=="ai-matchlab.exact-wrongday-removal.v2"){
  return rejected===0&&matched===removed?other:null;
 }
 const accepted=other.filter(f=>f.canonicalRemovalVerified===true&&f.teamIdentityVerified===true&&
  f.homeAwayOrientationVerified===true&&f.canonicalIdentityRejected===false&&
  Array.isArray(f.removedCanonicalFixtureIds)&&f.removedCanonicalFixtureIds.length===1&&text(f.removedCanonicalFixtureIds[0]));
 const denied=other.filter(f=>f.canonicalRemovalVerified===false&&f.canonicalIdentityRejected===true);
 return accepted.length===removed&&denied.length===rejected?accepted:null;
}
