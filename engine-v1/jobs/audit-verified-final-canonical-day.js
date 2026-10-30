import fs from "node:fs";
import path from "node:path";

// READ-ONLY: compare one day's pinned verified-finals to canonical fixtures.
// Never writes truth, history, Value or a reconciliation approval.
export function auditVerifiedFinalsDay({root,dayKey}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw Error("day_key_invalid");
  const finalsDir=path.join(root,"data","final-results",dayKey);
  const canonDir=path.join(root,"data","canonical-fixtures",dayKey);
  const issues=[],canonical=new Map();
  if (!fs.existsSync(finalsDir)||!fs.existsSync(canonDir)) throw Error("source_directory_missing");
  for (const file of fs.readdirSync(canonDir).filter(x=>x.endsWith(".json")).sort()) {
    const payload=JSON.parse(fs.readFileSync(path.join(canonDir,file),"utf8"));
    if (!Array.isArray(payload.fixtures)) {issues.push({reason:"canonical_fixture_array_missing",file});continue;}
    for (const row of payload.fixtures) {
      const id=row?.canonicalId;
      if (typeof id!=="string"||!id) {issues.push({reason:"canonical_id_missing",file});continue;}
      if (canonical.has(id)) issues.push({reason:"duplicate_canonical_id",matchId:id});
      else canonical.set(id,row);
    }
  }
  let checked=0,matched=0;
  const providerOwners=new Map();
  for (const file of fs.readdirSync(finalsDir).filter(x=>x.endsWith(".json")).sort()) {
    checked++;
    const final=JSON.parse(fs.readFileSync(path.join(finalsDir,file),"utf8"));
    const id=final?.matchId,fixture=canonical.get(id);
    for (const source of Array.isArray(final?.sources)?final.sources:[]) {
      const provider=source?.provider, providerId=source?.providerMatchId;
      if(typeof provider!=="string" || !provider || !providerId)continue;
      const key=provider+":"+String(providerId), owner=providerOwners.get(key);
      if(owner && owner!==id)issues.push({reason:"duplicate_verified_provider_identity",
        provider,providerMatchId:String(providerId),firstMatchId:owner,secondMatchId:id});
      else providerOwners.set(key,id);
    }
    if (!final?.verifiedFinalTruth||!id||file!==id+".json"||final?.dayKey!==dayKey) {
      issues.push({reason:"verified_final_identity_invalid",file});continue;
    }
    if (!fixture) {
      const sourceIds=new Set((final?.sources||[]).map(s=>String(s?.providerMatchId||"")).filter(Boolean));
      const candidates=[...canonical.values()].filter(row=>
        String(row?.sourceId||row?.sourceMatchId||"") &&
        sourceIds.has(String(row?.sourceId||row?.sourceMatchId||"")));
      const same=candidates.filter(row=>
        row?.scoreHome===final?.homeScore &&
        row?.scoreAway===final?.awayScore &&
        row?.kickoffUtc===final?.kickoffUtc);
      if (same.length===1) {
        issues.push({reason:"canonical_identity_alias_requires_adjudication",
          matchId:id,retainedCanonicalId:same[0].canonicalId,
          providerMatchId:String(same[0].sourceId||same[0].sourceMatchId),
          verifiedScore:[final.homeScore,final.awayScore]});
      } else {
        issues.push({reason:"canonical_fixture_not_found",matchId:id,
          providerCandidates:candidates.length});
      }
      continue;
    }
    const score=v=>[v?.homeScore ?? v?.scoreHome,v?.awayScore ?? v?.scoreAway];
    const actual=score(final),canonicalScore=score(fixture);
    if (!actual.every(Number.isInteger) || !canonicalScore.every(Number.isInteger) ||
        actual[0]!==canonicalScore[0] || actual[1]!==canonicalScore[1]) {
      issues.push({reason:"final_score_disagreement",matchId:id,verified:actual,canonical:canonicalScore});
      continue;
    }
    matched++;
  }
  return {ok:issues.length===0,readOnly:true,approvedForWrite:false,
    dayKey,canonicalFixtures:canonical.size,verifiedFinalFiles:checked,matched,issues};
}
