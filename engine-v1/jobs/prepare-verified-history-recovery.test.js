import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {selectVerifiedHistoryRecovery,prepareVerifiedHistoryRecovery} from './prepare-verified-history-recovery.js';
import {applyPreparedArchivedImport} from './apply-reviewed-archived-match-import.js';
import {applyVerifiedHistoryRecovery} from './apply-verified-history-recovery.js';
import {selectPrematchResearchEvidence,collectPrematchFinalForm} from '../core/prematch-verified-final-form.js';

const now=Date.parse('2026-10-22T04:00Z');
const fixture={canonicalId:'cid_future_bali_psm',leagueSlug:'idn.1',homeTeam:'Bali United',awayTeam:'PSM Makassar',kickoffUtc:'2026-10-22T14:00Z',providerIds:{flashscore:'future01'}};
const anchor={leagueSlug:'idn.1',providerMatchId:'future01',home:fixture.homeTeam,away:fixture.awayTeam,kickoffUtc:fixture.kickoffUtc,homeProviderTeamId:'home0001',awayProviderTeamId:'away0001',homeProviderTeamSlug:'bali-united',awayProviderTeamSlug:'psm-makassar'};
const target={canonicalId:fixture.canonicalId,leagueSlug:'idn.1',team:fixture.homeTeam,providerTeamId:'home0001',providerTeamSlug:'bali-united',nativeAnchor:anchor};
const candidate={providerMatchId:'match001',leagueSlug:'idn.1',home:'Bali United',away:'PSM Makassar',homeProviderTeamId:'home0001',awayProviderTeamId:'away0001',kickoffUtc:'2026-10-01T08:30Z',scoreHome:2,scoreAway:0,status:'FT'};
const document=rows=>({schema:'ai-matchlab.recent-results-research.v1',source:'flashscore',leagueSlug:'idn.1',valueInputVerified:false,authorityPromotionAllowed:false,
  url:'https://www.flashscore.com/team/bali-united/home0001/results/',responseSha256:'a'.repeat(64),teamBinding:target,rows});
const binding=(rows=[candidate])=>({target,documents:[document(rows)]});
const options={fixtures:[fixture],nowMs:now};
const html=c=>'window.environment = '+JSON.stringify({event_id_c:c.providerMatchId,sport_id:1,eventStageId:3,eventStageTypeId:3,common_feed:[{DA:3},{DB:3},{DC:Date.parse(c.kickoffUtc)/1000},{DE:String(c.scoreHome)},{DF:String(c.scoreAway)}],header:{country_name:'Indonesia',tournament:{link:'/football/indonesia/super-league/',tournament:'Super League'}},stats2_config:{tournament:'native01',tournamentStage:'native02'},participantsData:{home:[{id:c.homeProviderTeamId,name:c.home}],away:[{id:c.awayProviderTeamId,name:c.away}]}})+';';
const prepare=(bindings=[binding()],extra={})=>prepareVerifiedHistoryRecovery(bindings,{fixtures:[fixture],nowFn:()=>now,fetchFn:async()=>({ok:true,text:async()=>html(candidate)}),...extra});

test('known native results are skipped and all acquisition requires an exact future club binding',()=>{
  assert.equal(selectVerifiedHistoryRecovery([binding()],options).selected.length,1);
  assert.equal(selectVerifiedHistoryRecovery([binding()],{...options,canonicalRows:[{providerIds:{flashscore:'match001'}}]}).selected.length,0);
  for(const changed of [{...target,nativeAnchor:null},{...target,providerTeamId:'wrong001'},{...target,nativeAnchor:{...anchor,providerMatchId:'wrong001'}}]){
    assert.equal(selectVerifiedHistoryRecovery([{...binding(),target:changed}],options).selected.length,0);
  }
  assert.equal(selectVerifiedHistoryRecovery([binding()],{...options,fixtures:[fixture,fixture]}).selected.length,0);
  assert.equal(selectVerifiedHistoryRecovery([binding()],{...options,nowMs:Date.parse(fixture.kickoffUtc)}).selected.length,0);
});

test('unrelated teams, disabled domestic results and invalid evidence never reach a source request',async()=>{
  let calls=0;
  const b=binding([{...candidate,homeProviderTeamId:'other001'},{...candidate,leagueSlug:'tan.1'}]);
  b.documents.push({...document([candidate]),authorityPromotionAllowed:true});
  const result=await prepare([b],{fetchFn:async()=>{calls++;throw Error('not allowed');}});
  assert.equal(calls,0);assert.equal(result.attempted,0);assert.equal(result.accepted,0);
});

test('a same-time cross-provider event is quarantined, never merged or duplicated by guessed club aliases',()=>{
 const old={canonicalId:'cid_other_spelling',leagueSlug:candidate.leagueSlug,kickoffUtc:candidate.kickoffUtc,homeTeam:'Other spelling',awayTeam:'Opponent spelling',providerIds:{espn:'401234567'}};
 const result=selectVerifiedHistoryRecovery([binding()],{...options,canonicalRows:[old]});
 assert.equal(result.selected.length,0);assert.equal(result.rejected[0].reason,'CROSS_PROVIDER_EVENT_RECONCILIATION_REQUIRED');
 assert.equal(result.rejected[0].existingCanonicalId,old.canonicalId);
});

test('primary-page disagreement cannot be promoted; a separate valid result remains reviewable',async()=>{
  const other={...candidate,providerMatchId:'match002',kickoffUtc:'2026-10-02T08:30Z'};
  const result=await prepare([binding([candidate,other])],{fetchFn:async url=>({ok:true,text:async()=>html(url.includes('match002')?{...other,scoreHome:7}:candidate)})});
  assert.equal(result.accepted,1);assert.equal(result.proposals[0].canonicalProposal.providerIds.flashscore,'match001');
  assert.equal(result.rejected[0].reason,'PROFILE_MATCH_PAGE_PARITY_FAILED');
  assert.equal(result.productionWrites,0);assert.equal(result.reviewRequired,true);
});

for(const store of ['final-results','value-data-acquisition'])test(`an existing ${store} artifact is quarantined before the batch while unrelated results still apply`,async t=>{
  const root=temporary(t),planned=await prepare();
  const occupied=planned.batch.files.find(file=>file.path.startsWith(`data/${store}/`)).path;
  const target=path.join(root,occupied);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'existing original bytes');
  const other={...candidate,providerMatchId:'match002',kickoffUtc:'2026-10-02T08:30Z'};
  const result=await prepare([binding([candidate,other])],{pathExists:file=>fs.existsSync(path.join(root,file)),
    fetchFn:async url=>({ok:true,text:async()=>html(url.includes('match002')?other:candidate)})});
  assert.equal(result.accepted,1);assert.equal(result.batch.ok,true);
  assert.equal(result.proposals[0].canonicalProposal.providerIds.flashscore,'match002');
  assert.deepEqual(result.rejected,[{providerMatchId:'match001',reason:'EXISTING_EVIDENCE_RECONCILIATION_REQUIRED',paths:[occupied]}]);
  const applied=applyVerifiedHistoryRecovery(result,{root,dayKey:'2026-10-22',sourcePolicy:result.sourcePolicy,nowFn:()=>now,checkpoint:()=>{}});
  assert.equal(applied.canonicalAdditions,1);assert.equal(fs.readFileSync(target,'utf8'),'existing original bytes');
  assert.ok(!applied.writtenPaths.includes(occupied));
});

test('crossing target kickoff during source acquisition prevents preparation of that target history',async()=>{
  let clock=now;
  const result=await prepare(undefined,{nowFn:()=>clock,fetchFn:async()=>{clock=Date.parse(fixture.kickoffUtc)+1;return {ok:true,text:async()=>html(candidate)};}});
  assert.equal(result.accepted,0);
  assert.equal(result.rejected[0].reason,'TARGET_KICKOFF_PASSED_DURING_ACQUISITION');
});

test('pool limits and an exhausted acquisition budget remain explicit, without declaring readiness',async()=>{
  assert.throws(()=>selectVerifiedHistoryRecovery([binding()],{...options,maxCandidates:41}),/LIMIT/);
  const result=await prepare(undefined,{budgetMs:0});
  assert.equal(result.attempted,0);assert.equal(result.deferred,1);assert.equal(result.accepted,0);
  assert.equal(result.frozenPredictionsRegenerated,false);
});

test('prepared history is accepted by the unchanged strict consumer after an isolated transaction',async t=>{
  const result=await prepare();assert.equal(result.accepted,1);assert.equal(result.batch.files.length,3);
  const base=path.resolve('work','verified-recovery-tests');fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'case-'));
  t.after(()=>{if(!root.startsWith(base+path.sep))throw Error('test_scope');fs.rmSync(root,{recursive:true,force:true});});
  applyPreparedArchivedImport(result,{root});
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const docs=result.batch.files.filter(f=>f.path.includes('/value-data-acquisition/')).map(f=>read(f.path));
  const canonical=result.batch.files.filter(f=>f.path.includes('/canonical-fixtures/')).flatMap(f=>read(f.path).fixtures);
  const selected=selectPrematchResearchEvidence(docs,now);
  const consumed=collectPrematchFinalForm({},selected.candidates,now,{fixturesForDay:day=>canonical.filter(f=>f.dayKey===day),finalForFixture:(day,id)=>read(`data/final-results/${day}/${id}.json`)});
  assert.equal(consumed.summary.accepted,1);assert.deepEqual(consumed.summary.rejected,{});
});

function temporary(t){
 const base=path.resolve('work','verified-recovery-transaction-tests');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'case-'));
 t.after(()=>{if(!root.startsWith(base+path.sep))throw Error('test_scope');fs.rmSync(root,{recursive:true,force:true});});return root;
}

test('automatic application requires the explicit source policy and preserves frozen predictions',async t=>{
 const root=temporary(t),prepared=await prepare();
 assert.throws(()=>applyVerifiedHistoryRecovery(prepared,{root,dayKey:'2026-10-22',nowFn:()=>now}),/POLICY_REQUIRED/);
 const frozen=path.join(root,'data/value-unified/2026-10-22/public-plan.json');fs.mkdirSync(path.dirname(frozen),{recursive:true});fs.writeFileSync(frozen,'{"frozen":"original"}');
 const checkpoints=[];
 const applied=applyVerifiedHistoryRecovery(prepared,{root,dayKey:'2026-10-22',sourcePolicy:prepared.sourcePolicy,nowFn:()=>now,checkpoint:(_day,stage)=>checkpoints.push(stage)});
 assert.equal(applied.canonicalAdditions,1);assert.equal(applied.individualRowsHumanReviewed,false);
 assert.deepEqual(checkpoints,['before-automatic-verified-history','after-automatic-verified-history']);
 assert.equal(fs.readFileSync(frozen,'utf8'),'{"frozen":"original"}');
});

test('failed durability after automatic writes rolls back every imported file and restores original canonical bytes',async t=>{
 const root=temporary(t),prepared=await prepare();
 const file=prepared.batch.files.find(f=>f.path.includes('/canonical-fixtures/')).path;
 const destination=path.join(root,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
 const original='{"preserved":true,"fixtures":[{"canonicalId":"cid_original"}]}';fs.writeFileSync(destination,original);
 assert.throws(()=>applyVerifiedHistoryRecovery(prepared,{root,dayKey:'2026-10-22',sourcePolicy:prepared.sourcePolicy,nowFn:()=>now,checkpoint:(_day,stage)=>{if(stage.startsWith('after-'))throw Error('durability failed');}}),/durability failed/);
 assert.equal(fs.readFileSync(destination,'utf8'),original);
 for(const entry of prepared.batch.files.filter(f=>f.path!==file))assert.equal(fs.existsSync(path.join(root,entry.path)),false);
});

test('scope expiry during the before-write checkpoint prevents every automatic write',async t=>{
 const root=temporary(t),prepared=await prepare();let clock=now;
 assert.throws(()=>applyVerifiedHistoryRecovery(prepared,{root,dayKey:'2026-10-22',sourcePolicy:prepared.sourcePolicy,nowFn:()=>clock,checkpoint:()=>{clock=Date.parse(fixture.kickoffUtc);}}),/SCOPE_EXPIRED/);
 assert.equal(fs.existsSync(path.join(root,'data')),false);
});
