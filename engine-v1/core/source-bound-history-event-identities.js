import {buildVerifiedHistoryDay} from '../jobs/append-finalized-day-to-history.js';
import {canonicalTeamName} from '../storage/team-aliases-db.js';
const norm=(slug,name)=>String(canonicalTeamName(slug,name)||name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ts=r=>Number(r.kickoff_ms)||Date.parse(r.kickoff||r.kickoffUtc);
export function buildSourceBoundHistoryEventIdentities(entries){
 const facts=new Map();
 for(const {canonical,final,sourceSha256} of entries){
  if(!/^[a-f0-9]{64}$/.test(sourceSha256||''))continue;
  const ids=Object.fromEntries(Object.entries(canonical.providerIds||{}).filter(([p,id])=>
   p==='flashscore'&&/^[A-Za-z0-9]{6,16}$/.test(id)||p==='espn'&&/^\d+$/.test(id)));
  if(!Object.keys(ids).length)continue;
  const built=buildVerifiedHistoryDay({dayKey:canonical.dayKey,canonicalRows:[canonical],finalResultRows:[final],rebuiltAt:0});
  if(!built.ok||built.rows.length!==1)continue;
  facts.set(canonical.canonicalId,{row:built.rows[0],providerIds:ids,sourceSha256});
 }
 return {count:facts.size,resolveEvent:row=>{
  const known=facts.get(row.id);if(!known)return {ok:false};const r=known.row;
  if(row.leagueSlug!==r.leagueSlug||ts(row)!==ts(r)||row.scoreHome!==r.scoreHome||row.scoreAway!==r.scoreAway
    ||norm(row.leagueSlug,row.homeTeam)!==norm(r.leagueSlug,r.homeTeam)||norm(row.leagueSlug,row.awayTeam)!==norm(r.leagueSlug,r.awayTeam))return {ok:false};
  return {ok:true,canonicalId:row.id,verifiedFinalTruth:true,providerIds:known.providerIds,sourceSha256:known.sourceSha256,
   eventKey:JSON.stringify([row.leagueSlug,ts(row),norm(row.leagueSlug,row.homeTeam),norm(row.leagueSlug,row.awayTeam)])};
 }};
}
