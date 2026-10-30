import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

function verifiedProviderIdentity(source) {
 const named=typeof source?.provider==="string" ? source.provider.trim() : "";
 // Historical manual adjudications use authority=flashscore, not provider.
 // Only recognize known exact provider names; do not infer a provider from
 // non-provider authority markers, scores or unverified repair notes.
 const authority=typeof source?.authority==="string" ? source.authority.trim().toLowerCase() : "";
 const provider=named || (["flashscore","espn"].includes(authority) ? authority : "");
 const id=source?.providerMatchId;
 return provider && id!==null && id!==undefined && String(id).trim()
   ? {provider,providerMatchId:String(id).trim()} : null;
}

// Pure read-only historical inventory. File names and provider bindings are evidence,
// not permission to delete, rename, settle, or silently collapse any fixture.
export function auditAllVerifiedFinalProviderIdentities(root) {
 const files=execFileSync("git",["ls-files","-z","--","data/final-results"],{
  cwd:root,maxBuffer:64*1024*1024
 }).toString("utf8").split("\0").filter(x=>x.endsWith(".json"));
 const index=new Map(),duplicates=[],unverifiable=[];
 let checked=0,bindings=0;
 for(const file of files) {
  try {
   const payload=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
   checked++;
   if(!Array.isArray(payload?.sources)) {
    unverifiable.push({path:file,reason:"provider_sources_missing_or_invalid"});continue;
   }
   // An empty/malformed provider list gives no proof of identity uniqueness.
   const validSources=payload.sources.map(verifiedProviderIdentity).filter(Boolean);
   if(validSources.length===0) {
     unverifiable.push({path:file,reason:"provider_identity_evidence_missing"});continue;
   }
   const seen=new Set();
   for(const source of validSources) {
    if(typeof source?.provider!=="string"||!source.provider||!source.providerMatchId)continue;
    const key=JSON.stringify([source.provider,String(source.providerMatchId)]);
    if(seen.has(key))continue;
    seen.add(key);bindings++;
    const previous=index.get(key);
    if(previous && previous.path!==file) {
     duplicates.push({provider:source.provider,providerMatchId:String(source.providerMatchId),
       firstPath:previous.path,firstMatchId:previous.matchId,
       secondPath:file,secondMatchId:payload?.matchId||null,
       firstScore:previous.score,secondScore:[payload?.homeScore,payload?.awayScore],
       firstKickoffUtc:previous.kickoffUtc,secondKickoffUtc:payload?.kickoffUtc||null,
       kickoffAgreement:previous.kickoffUtc && payload?.kickoffUtc
         ? previous.kickoffUtc===payload.kickoffUtc : null,
       firstProviderTerminal:previous.providerTerminal,
       secondProviderTerminal:payload.sources.some(x=>verifiedProviderIdentity(x)?.provider===source.provider &&
         verifiedProviderIdentity(x)?.providerMatchId===source.providerMatchId &&
         x.finished===true && x.playedFinal===true),
       identityAdjudicationRequired:true,
       scoreAgreement:Number.isInteger(previous.score[0]) &&
         Number.isInteger(previous.score[1]) &&
         Number.isInteger(payload?.homeScore) && Number.isInteger(payload?.awayScore)
           ? (previous.score[0]===payload.homeScore &&
              previous.score[1]===payload.awayScore)
           : null});
    } else if(!previous)index.set(key,{path:file,matchId:payload?.matchId||null,score:[payload?.homeScore,payload?.awayScore],
       kickoffUtc:payload?.kickoffUtc||null,
       providerTerminal:source.finished===true && source.playedFinal===true});
   }
  } catch(error) {
   unverifiable.push({path:file,reason:"provider_source_unreadable",error:String(error?.message||error)});
  }
 }
 return {ok:duplicates.length===0&&unverifiable.length===0,readOnly:true,
  approvedForWrite:false,trackedFinalFiles:files.length,checked,providerBindings:bindings,
  uniqueProviderMatches:index.size,duplicateCount:duplicates.length,scoreConflictCount:duplicates.filter(x=>x.scoreAgreement===false).length,
  scoreAgreementCount:duplicates.filter(x=>x.scoreAgreement===true).length,
  scoreUnverifiableCount:duplicates.filter(x=>x.scoreAgreement===null).length,
  kickoffDisagreementCount:duplicates.filter(x=>x.kickoffAgreement===false).length,
  ambiguousTerminalEvidenceCount:duplicates.filter(x=>x.firstProviderTerminal!==x.secondProviderTerminal).length,
  unverifiableCount:unverifiable.length,duplicates,unverifiable};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const result=auditAllVerifiedFinalProviderIdentities(process.cwd());
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
