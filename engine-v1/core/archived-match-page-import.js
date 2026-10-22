import crypto from 'node:crypto';
import {resolveResearchCompetition} from '../odds/flashscore-league-map.js';
import {isDisabledLeague} from '../source-discovery/disabled-leagues.js';
import {athensDayFromKickoff} from './daykey.js';
import {buildCanonicalId} from './canonical-id.js';
import {buildVerifiedFinalResult} from '../jobs/export-verified-final-results-day.js';
import {validatePrematchFinalForm} from './prematch-verified-final-form.js';

// Quarantined import proposal only. Callers must acquire the exact native page;
// no source scripts execute and no existing canonical/final truth is written.
export function proposeArchivedMatchImport({html,candidate,sourceUrl,acquiredAt,nowMs=Date.now()}) {
  const deny=reason=>({ok:false,reason,productionWrites:0});
  if (!candidate || !/^[A-Za-z0-9]{6,16}$/.test(candidate.providerMatchId||'')) return deny('INVALID_NATIVE_MATCH_ID');
  if (sourceUrl!==`https://www.flashscore.com/match/${candidate.providerMatchId}/`) return deny('EXACT_SOURCE_ROUTE_REQUIRED');
  if (isDisabledLeague(candidate.leagueSlug)) return deny('DISABLED_COMPETITION');
  const acquired=Date.parse(acquiredAt);
  if (!Number.isFinite(acquired)||acquired>nowMs) return deny('SOURCE_AVAILABILITY_INVALID');
  if (typeof html!=='string'||Buffer.byteLength(html)>5*1024*1024) return deny('SOURCE_SIZE_INVALID');
  const marker='window.environment = ';
  const lines=html.split('\n').filter(line=>line.includes(marker));
  if(lines.length!==1)return deny('SOURCE_ENVIRONMENT_NOT_UNIQUE');
  let e;
  try {e=JSON.parse(lines[0].slice(lines[0].indexOf(marker)+marker.length).trim().replace(/;$/,''));}
  catch{return deny('SOURCE_ENVIRONMENT_INVALID');}
  const f=Object.assign({},...(Array.isArray(e.common_feed)?e.common_feed:[]));
  const h=e.participantsData?.home,a=e.participantsData?.away;
  if(h?.length!==1||a?.length!==1||h[0].id===a[0].id)return deny('NATIVE_TEAM_IDENTITY_NOT_UNIQUE');
  const kickoff=Number(f.DC)*1000;
  if(!Number.isFinite(kickoff)||kickoff>=acquired||kickoff>=nowMs||kickoff<nowMs-180*86400000)return deny('OUTSIDE_VERIFIED_PAST_WINDOW');
  const slug=resolveResearchCompetition({leaguePath:e.header?.tournament?.link,leagueName:e.header?.tournament?.tournament});
  if(e.sport_id!==1||e.eventStageId!==3||e.eventStageTypeId!==3||f.DA!==3||f.DB!==3)return deny('REGULATION_FINAL_REQUIRED');
  const source={providerMatchId:e.event_id_c,leagueSlug:slug,home:h[0].name,away:a[0].name,homeProviderTeamId:h[0].id,awayProviderTeamId:a[0].id,scoreHome:Number(f.DE),scoreAway:Number(f.DF)};
  if(![h[0].id,a[0].id].every(id=>/^[A-Za-z0-9]{6,16}$/.test(id||'')))return deny('INVALID_NATIVE_TEAM_ID');
  if(![f.DE,f.DF].every(n=>/^\d+$/.test(String(n)))||![source.scoreHome,source.scoreAway].every(n=>Number.isSafeInteger(n)&&n>=0))return deny('REGULATION_SCORE_REQUIRED');
  if(Object.keys(source).some(key=>source[key]!==candidate[key])||Date.parse(candidate.kickoffUtc)!==kickoff)return deny('PROFILE_MATCH_PAGE_PARITY_FAILED');
  const kickoffUtc=new Date(kickoff).toISOString(),dayKey=athensDayFromKickoff(kickoffUtc);
  const canonicalId=buildCanonicalId(slug,source.home,source.away,dayKey);
  const proof={sourceUrl,acquiredAt,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),providerMatchId:source.providerMatchId,homeProviderTeamId:source.homeProviderTeamId,awayProviderTeamId:source.awayProviderTeamId,tournamentId:e.stats2_config?.tournament,stageId:e.stats2_config?.tournamentStage};
  const canonical={canonicalId,matchId:canonicalId,matchKey:canonicalId,source:'flashscore',sourceId:source.providerMatchId,sourceMatchId:source.providerMatchId,providerIds:{flashscore:source.providerMatchId},leagueSlug:slug,leagueName:e.header?.tournament?.tournament,dayKey,kickoffUtc,homeTeam:source.home,awayTeam:source.away,status:'FT',statusType:'STATUS_FINAL',rawStatus:'STATUS_FINAL',scoreHome:source.scoreHome,scoreAway:source.scoreAway,firstSeenAt:acquiredAt,lastSeenAt:acquiredAt,archivedSourceEvidence:proof};
  const final=buildVerifiedFinalResult(dayKey,canonical,{...source,matchId:source.providerMatchId,kickoffUtc,home:source.home,away:source.away,finished:true,playedFinal:true,nonPlayedTerminal:false,statusCode:String(e.eventStageTypeId),statusDetailCode:String(e.eventStageId),leaguePath:e.header?.tournament?.link,leagueName:canonical.leagueName,country:e.header?.country_name});
  // Report this adapter's real provenance, never claim it was a daily feed.
  final.source='flashscore_archived_match_page_exact_native_parity';
  final.verification.method=final.source;
  final.generatedAt=new Date(nowMs).toISOString();final.verification.generatedAt=final.generatedAt;
  final.archivedSourceEvidence=proof;
  const validated=validatePrematchFinalForm(candidate,canonical,final,nowMs);
  if(!validated.ok)return deny(validated.reason);
  return {ok:true,productionWrites:0,authorityPromoted:false,reviewRequired:true,canonicalProposal:canonical,finalProposal:final,consumerValidation:'PASSED',predictionsChanged:false};
}

// Prepare a single reviewable batch. Existing identities and finals are never
// replaced; any collision blocks the whole batch instead of a partial import.
export function planArchivedMatchImportBatch(proposals,{canonicalRows=[],finalRows=[]}={}) {
  const conflicts=[],ids=new Set(),nativeIds=new Set(),groups=new Map(),files=[];
  for(const proposal of proposals){
    if(!proposal?.ok||proposal.productionWrites!==0||proposal.authorityPromoted!==false){conflicts.push('UNVALIDATED_PROPOSAL');continue;}
    const c=proposal.canonicalProposal,f=proposal.finalProposal;
    const native=c.providerIds?.flashscore,key=native;
    if(ids.has(c.canonicalId)||nativeIds.has(key)){conflicts.push('DUPLICATE_PROPOSED_IDENTITY');continue;}
    ids.add(c.canonicalId);nativeIds.add(key);
    if(canonicalRows.some(old=>old.canonicalId===c.canonicalId||old.providerIds?.flashscore===native||old.source==='flashscore'&&(old.sourceMatchId||old.sourceId)===native)){conflicts.push('EXISTING_CANONICAL_IDENTITY_REQUIRES_RECONCILIATION');continue;}
    if(finalRows.some(old=>old.matchId===c.canonicalId)){conflicts.push('EXISTING_FINAL_MUST_NOT_BE_OVERWRITTEN');continue;}
    const path=`data/canonical-fixtures/${c.dayKey}/${c.leagueSlug}.json`;
    const rows=groups.get(path)||[];rows.push(c);groups.set(path,rows);
    files.push({path:`data/final-results/${c.dayKey}/${c.canonicalId}.json`,mode:'CREATE_ONLY_AFTER_REVIEW',payload:f});
  }
  for(const [path,fixtures] of groups)files.push({path,mode:'MERGE_ADDITIVE_ONLY_AFTER_REVIEW',payload:{dayKey:fixtures[0].dayKey,leagueSlug:fixtures[0].leagueSlug,fixtures}});
  return {ok:conflicts.length===0,productionWrites:0,authorityPromoted:false,reviewRequired:true,conflicts:[...new Set(conflicts)],files:conflicts.length?[]:files};
}
