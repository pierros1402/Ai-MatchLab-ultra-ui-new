import {isDisabledLeague} from '../source-discovery/disabled-leagues.js';
import {selectTeamHistoryTargets} from '../source-discovery/team-history-researcher.js';
import {prepareArchivedMatchImport} from './prepare-archived-match-import.js';
import {planArchivedMatchImportBatch} from '../core/archived-match-page-import.js';

export {VERIFIED_HISTORY_POLICY} from '../core/verified-history-recovery-boundary.js';
import {VERIFIED_HISTORY_POLICY} from '../core/verified-history-recovery-boundary.js';
const identity = row => JSON.stringify(['leagueSlug','home','away','homeProviderTeamId','awayProviderTeamId','kickoffUtc','scoreHome','scoreAway'].map(key=>row[key]));
const nativeId = row => {
  const value=row.providerIds?.flashscore || (row.source==='flashscore' ? row.sourceMatchId || row.sourceId : null);
  return /^[A-Za-z0-9]{6,16}$/.test(value||'')?value:null;
};

// Select only profile results tied to an independently bound future fixture.
// No names-only links, disabled competitions, global result harvesting or expiry
// of unresolved incidents are introduced by this preparation.
export function selectVerifiedHistoryRecovery(bindings,{fixtures,canonicalRows=[],nowMs,maxCandidates=40,resolveProviderIdentity=null}={}) {
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>40)throw Error('INVALID_HISTORY_RECOVERY_LIMIT');
  const existing=new Set(canonicalRows.map(nativeId).filter(Boolean));
  const pool=new Map(),conflicts=new Set(),rejected=[];
  for(const {target,documents=[]} of bindings){
    const matches=fixtures.filter(f=>f.canonicalId===target?.canonicalId);
    if(matches.length!==1||isDisabledLeague(target?.leagueSlug)||!target?.nativeAnchor){rejected.push({canonicalId:target?.canonicalId,reason:'FUTURE_NATIVE_BINDING_REQUIRED'});continue;}
    const fixture=matches[0];
    const selection=selectTeamHistoryTargets({upcomingAnchors:[target.nativeAnchor]},[{...fixture,modelInputDiagnosis:{homeSample:0,awaySample:0}}],[fixture],{},nowMs,2,resolveProviderIdentity);
    if(!selection.targets.some(t=>t.providerTeamId===target.providerTeamId&&t.providerTeamSlug===target.providerTeamSlug&&t.team===target.team)){
      rejected.push({canonicalId:target.canonicalId,reason:'FUTURE_NATIVE_BINDING_REQUIRED'});continue;
    }
    const profileUrl=`https://www.flashscore.com/team/${target.providerTeamSlug}/${target.providerTeamId}/results/`;
    const rows=documents.filter(d=>d.url===profileUrl&&/^[a-f0-9]{64}$/.test(d.responseSha256||'')
      &&d.teamBinding?.canonicalId===target.canonicalId&&d.teamBinding?.providerTeamId===target.providerTeamId
      &&/^[a-z0-9_.-]+$/.test(d.leagueSlug||'')&&d.source==='flashscore'&&d.schema==='ai-matchlab.recent-results-research.v1'&&d.valueInputVerified===false&&d.authorityPromotionAllowed===false)
      .flatMap(d=>(d.rows||[]).filter(row=>row.leagueSlug===d.leagueSlug));
    const eligible=rows.filter(row=>!existing.has(row.providerMatchId)&&!isDisabledLeague(row.leagueSlug)&&row.status==='FT'
      &&[row.homeProviderTeamId,row.awayProviderTeamId].includes(target.providerTeamId)
      &&Date.parse(row.kickoffUtc)<nowMs&&Date.parse(row.kickoffUtc)>=nowMs-180*86400000)
      .sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc));
    let selected=0;
    for(const row of eligible){
      if(selected>=6)break;
      // A different spelling under an ESPN-only canonical record must not
      // become a second event. Equal time alone is NOT an identity proof:
      // quarantine the overlap for explicit provider reconciliation instead.
      const overlap=canonicalRows.find(old=>old.leagueSlug===row.leagueSlug&&Date.parse(old.kickoffUtc)===Date.parse(row.kickoffUtc)&&!nativeId(old));
      if(overlap){rejected.push({canonicalId:target.canonicalId,providerMatchId:row.providerMatchId,existingCanonicalId:overlap.canonicalId,reason:'CROSS_PROVIDER_EVENT_RECONCILIATION_REQUIRED'});continue;}
      const old=pool.get(row.providerMatchId);
      if(old&&identity(old.candidate)!==identity(row)){conflicts.add(row.providerMatchId);continue;}
      const binding={canonicalId:fixture.canonicalId,kickoffUtc:fixture.kickoffUtc,providerTeamId:target.providerTeamId};
      if(old){if(!old.bindings.some(b=>b.canonicalId===binding.canonicalId&&b.providerTeamId===binding.providerTeamId))old.bindings.push(binding);}
      else pool.set(row.providerMatchId,{candidate:row,bindings:[binding]});
      selected++;
    }
  }
  for(const id of conflicts){pool.delete(id);rejected.push({providerMatchId:id,reason:'PROFILE_RESULT_CONFLICT'});}
  const ordered=[...pool.values()].sort((a,b)=>Math.min(...a.bindings.map(x=>Date.parse(x.kickoffUtc)))-Math.min(...b.bindings.map(x=>Date.parse(x.kickoffUtc)))||Date.parse(b.candidate.kickoffUtc)-Date.parse(a.candidate.kickoffUtc));
  return {selected:ordered.slice(0,maxCandidates),deferred:Math.max(0,ordered.length-maxCandidates),rejected,productionWrites:0};
}

// This remains a read-only proposal. Activation and the shared writer transaction
// are separate from acquisition. Every native match page is freshly rechecked.
export async function prepareVerifiedHistoryRecovery(bindings,{fixtures,canonicalRows=[],nowFn=()=>Date.now(),fetchFn=fetch,resolveProviderIdentity=null,maxCandidates=40,budgetMs=120000,pathExists=()=>false}={}) {
  if(!Number.isInteger(budgetMs)||budgetMs<0||budgetMs>120000)throw Error('INVALID_HISTORY_RECOVERY_BUDGET');
  const selection=selectVerifiedHistoryRecovery(bindings,{fixtures,canonicalRows,nowMs:nowFn(),maxCandidates,resolveProviderIdentity});
  const start=Date.now(),accepted=[],rejected=[...selection.rejected];
  let attempted=0;
  for(let offset=0;offset<selection.selected.length;offset+=4){
    if(Date.now()-start>=budgetMs)break;
    const results=await Promise.all(selection.selected.slice(offset,offset+4).map(async item=>{
      const boundedFetch=(url,options)=>fetchFn(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(Math.max(1,budgetMs-(Date.now()-start)))])});
      const report=await prepareArchivedMatchImport({schema:'ai-matchlab.archived-match-review-batch.v1',candidates:[item.candidate]},{nowFn,fetchFn:boundedFetch,canonicalRows});
      return {item,report};
    }));
    attempted+=results.length;
    for(const {item,report} of results){
      if(!item.bindings.some(b=>Date.parse(b.kickoffUtc)>nowFn())){rejected.push({providerMatchId:item.candidate.providerMatchId,reason:'TARGET_KICKOFF_PASSED_DURING_ACQUISITION'});continue;}
      if(!report.batch.ok){rejected.push({providerMatchId:item.candidate.providerMatchId,reason:report.proposals[0]?.reason||report.batch.conflicts.join(',')});continue;}
      const occupied=report.batch.files.filter(file=>file.mode==='CREATE_ONLY_AFTER_REVIEW'&&pathExists(file.path));
      if(occupied.length){
        rejected.push({providerMatchId:item.candidate.providerMatchId,reason:'EXISTING_EVIDENCE_RECONCILIATION_REQUIRED',paths:occupied.map(file=>file.path)});
        continue;
      }
      accepted.push({item,report});
    }
  }
  const proposals=accepted.map(x=>x.report.proposals[0]);
  const batch=planArchivedMatchImportBatch(proposals,{canonicalRows});
  if(batch.ok)batch.files.push(...accepted.flatMap(x=>x.report.batch.files.filter(file=>file.path.startsWith('data/value-data-acquisition/'))));
  return {schema:'ai-matchlab.verified-history-recovery-preparation.v1',generatedAt:new Date(nowFn()).toISOString(),sourcePolicy:VERIFIED_HISTORY_POLICY,
    productionWrites:0,authorityPromoted:false,reviewRequired:true,proposals,batch,
    scope:accepted.map(x=>({providerMatchId:x.item.candidate.providerMatchId,bindings:x.item.bindings})),
    attempted,accepted:accepted.length,deferred:selection.deferred+selection.selected.length-attempted,rejected,
    frozenPredictionsRegenerated:false};
}
