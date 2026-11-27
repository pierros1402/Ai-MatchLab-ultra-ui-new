import {buildVerifiedHistoryDay} from '../jobs/append-finalized-day-to-history.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
const norm=(slug,name)=>String(canonicalTeamName(slug,name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ts=r=>Number(r.kickoff_ms)||Date.parse(r.kickoff||r.kickoffUtc);
export function buildSourceBoundHistoryEventIdentities(entries){
 const facts=new Map();
 const ambiguousIds=new Set();
 for(const {canonical,final,sourceSha256} of entries){
  if(!/^[a-f0-9]{64}$/.test(sourceSha256||''))continue;
  const ids=Object.fromEntries(Object.entries(canonical.providerIds||{}).filter(([p,id])=>
   p==='flashscore'&&/^[A-Za-z0-9]{6,16}$/.test(id)||p==='espn'&&/^\d+$/.test(id)||p==='sofascore'&&/^\d+$/.test(id)));
  if(!Object.keys(ids).length)continue;
  const built=buildVerifiedHistoryDay({dayKey:canonical.dayKey,canonicalRows:[canonical],finalResultRows:[final],rebuiltAt:0});
  if(!built.ok||built.rows.length!==1)continue;
  if(facts.has(canonical.canonicalId)){ambiguousIds.add(canonical.canonicalId);continue;}
  const verifiedProviderIds=Object.fromEntries(Object.entries(ids).filter(([provider,nativeId])=>
   Array.isArray(final.sources)&&final.sources.some(source=>source.provider===provider&&String(source.providerMatchId)===String(nativeId)&&source.finished===true&&source.playedFinal===true&&source.nonPlayedTerminal===false)));
  facts.set(canonical.canonicalId,{row:built.rows[0],providerIds:ids,verifiedProviderIds,sourceSha256});
 }
 for(const id of ambiguousIds)facts.delete(id);
 const eventKey=r=>JSON.stringify([r.leagueSlug,ts(r),norm(r.leagueSlug,r.homeTeam),norm(r.leagueSlug,r.awayTeam)]);
 // Provider identifiers must be unique across verified canonical events.
 // A matching score/time alone is never authorization for a different ID.
 const providerOwners=new Map();
 for(const [id,fact] of facts)for(const [provider,nativeId] of Object.entries(fact.providerIds)){
  const key=provider+':'+nativeId;
  const owners=providerOwners.get(key)||new Set();owners.add(id);providerOwners.set(key,owners);
 }
 const byEvent=new Map();
 for(const [id,fact] of facts){const key=eventKey(fact.row);const list=byEvent.get(key)||[];list.push(id);byEvent.set(key,list);}
 const findAliasCandidates=row=>{
  if(!row?.id||!row.leagueSlug||!Number.isFinite(ts(row))||!row.homeTeam||!row.awayTeam||!['FT','STATUS_FULL_TIME'].includes(row.status))return {ok:false,reason:'INVALID_HISTORY_FACT'};
  const ids=byEvent.get(eventKey(row))||[];
  if(ids.length!==1)return {ok:false,reason:ids.length?'AMBIGUOUS_EVENT':'NO_EVENT',candidateIds:ids};
  const id=ids[0],fact=facts.get(id);
  if(!Number.isInteger(row.scoreHome)||!Number.isInteger(row.scoreAway)||row.scoreHome!==fact.row.scoreHome||row.scoreAway!==fact.row.scoreAway)return {ok:false,reason:'SCORE_CONFLICT',candidateIds:ids};
  return {ok:true,canonicalId:id,sourceId:row.id,providerIds:fact.providerIds,sourceSha256:fact.sourceSha256,requiresIndependentIdentityApproval:row.id!==id};
 };
 return {count:facts.size,findAliasCandidates,resolveBoundProviderAlias:row=>{
  const candidate=findAliasCandidates(row);
  if(!candidate.ok)return candidate;
  const match=/^(fs_([A-Za-z0-9]{6,16})|espn_(\d+)|sofa_(\d+))$/u.exec(String(row.id));
  if(!match)return {ok:false,reason:'UNSUPPORTED_PROVIDER_ID'};
  const provider=match[2]?'flashscore':match[3]?'espn':'sofascore';
  const nativeId=match[2]||match[3]||match[4];
  const owners=providerOwners.get(provider+':'+nativeId);
  if(!owners||owners.size!==1||!owners.has(candidate.canonicalId))return {ok:false,reason:'PROVIDER_ID_NOT_UNIQUELY_BOUND'};
  if(String(facts.get(candidate.canonicalId).verifiedProviderIds[provider]||'')!==nativeId)return {ok:false,reason:'PROVIDER_FINAL_EVIDENCE_REQUIRED'};
  return {...candidate,requiresIndependentIdentityApproval:false,providerBindingVerified:true,sourceHistoryRewriteAuthorized:false,canonicalResultRewriteAuthorized:false};
 },resolveEvent:row=>{
  const known=facts.get(row.id);if(!known)return {ok:false};const r=known.row;
  if(row.leagueSlug!==r.leagueSlug||ts(row)!==ts(r)||row.scoreHome!==r.scoreHome||row.scoreAway!==r.scoreAway
    ||norm(row.leagueSlug,row.homeTeam)!==norm(r.leagueSlug,r.homeTeam)||norm(row.leagueSlug,row.awayTeam)!==norm(r.leagueSlug,r.awayTeam))return {ok:false};
  return {ok:true,canonicalId:row.id,verifiedFinalTruth:true,providerIds:known.providerIds,sourceSha256:known.sourceSha256,
   eventKey:JSON.stringify([row.leagueSlug,ts(row),norm(row.leagueSlug,row.homeTeam),norm(row.leagueSlug,row.awayTeam)])};
 }};
}
