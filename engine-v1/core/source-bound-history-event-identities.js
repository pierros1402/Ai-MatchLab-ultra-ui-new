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
   p==='flashscore'&&/^[A-Za-z0-9]{6,16}$/.test(id)||p==='espn'&&/^\d+$/.test(id)));
  if(!Object.keys(ids).length)continue;
  const built=buildVerifiedHistoryDay({dayKey:canonical.dayKey,canonicalRows:[canonical],finalResultRows:[final],rebuiltAt:0});
  if(!built.ok||built.rows.length!==1)continue;
  if(facts.has(canonical.canonicalId)){ambiguousIds.add(canonical.canonicalId);continue;}
  facts.set(canonical.canonicalId,{row:built.rows[0],providerIds:ids,sourceSha256});
 }
 for(const id of ambiguousIds)facts.delete(id);
 const eventKey=r=>JSON.stringify([r.leagueSlug,ts(r),norm(r.leagueSlug,r.homeTeam),norm(r.leagueSlug,r.awayTeam)]);
 const byEvent=new Map();
 for(const [id,fact] of facts){const key=eventKey(fact.row);const list=byEvent.get(key)||[];list.push(id);byEvent.set(key,list);}
 return {count:facts.size,findAliasCandidates:row=>{
  if(!row?.id||!row.leagueSlug||!Number.isFinite(ts(row))||!row.homeTeam||!row.awayTeam||!['FT','STATUS_FULL_TIME'].includes(row.status))return {ok:false,reason:'INVALID_HISTORY_FACT'};
  const ids=byEvent.get(eventKey(row))||[];
  if(ids.length!==1)return {ok:false,reason:ids.length?'AMBIGUOUS_EVENT':'NO_EVENT',candidateIds:ids};
  const id=ids[0],fact=facts.get(id);
  if(!Number.isInteger(row.scoreHome)||!Number.isInteger(row.scoreAway)||row.scoreHome!==fact.row.scoreHome||row.scoreAway!==fact.row.scoreAway)return {ok:false,reason:'SCORE_CONFLICT',candidateIds:ids};
  return {ok:true,canonicalId:id,sourceId:row.id,providerIds:fact.providerIds,sourceSha256:fact.sourceSha256,requiresIndependentIdentityApproval:row.id!==id};
 },resolveEvent:row=>{
  const known=facts.get(row.id);if(!known)return {ok:false};const r=known.row;
  if(row.leagueSlug!==r.leagueSlug||ts(row)!==ts(r)||row.scoreHome!==r.scoreHome||row.scoreAway!==r.scoreAway
    ||norm(row.leagueSlug,row.homeTeam)!==norm(r.leagueSlug,r.homeTeam)||norm(row.leagueSlug,row.awayTeam)!==norm(r.leagueSlug,r.awayTeam))return {ok:false};
  return {ok:true,canonicalId:row.id,verifiedFinalTruth:true,providerIds:known.providerIds,sourceSha256:known.sourceSha256,
   eventKey:JSON.stringify([row.leagueSlug,ts(row),norm(row.leagueSlug,row.homeTeam),norm(row.leagueSlug,row.awayTeam)])};
 }};
}
