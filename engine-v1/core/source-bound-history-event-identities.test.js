import test from 'node:test';import assert from 'node:assert/strict';
import {buildSourceBoundHistoryEventIdentities} from './source-bound-history-event-identities.js';
const canonical={canonicalId:'cid_test',dayKey:'2026-09-01',leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoffUtc:'2026-09-01T18:00Z',status:'FT',rawStatus:'STATUS_FINAL',scoreHome:1,scoreAway:0,providerIds:{flashscore:'NATIVE01'}};
const final={matchId:'cid_test',dayKey:'2026-09-01',leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoffUtc:canonical.kickoffUtc,status:'FT',scoreHome:1,scoreAway:0,verifiedFinalTruth:true,verdict:'verified_final_result'};
const entry={canonical,final,sourceSha256:'a'.repeat(64)};
const row={id:canonical.canonicalId,leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoff:canonical.kickoffUtc,scoreHome:1,scoreAway:0};
test('native event proof requires the existing canonical/final validator and exact history fact binding',()=>{
 const resolver=buildSourceBoundHistoryEventIdentities([entry]);assert.equal(resolver.count,1);assert.equal(resolver.resolveEvent(row).providerIds.flashscore,'NATIVE01');
 for(const patch of [{scoreHome:9},{homeTeam:'Other'},{kickoff:'2026-09-01T19:00Z'},{id:'other'}])assert.equal(resolver.resolveEvent({...row,...patch}).ok,false);
 assert.equal(buildSourceBoundHistoryEventIdentities([{...entry,final:{...final,scoreHome:9}}]).count,0);
 assert.equal(buildSourceBoundHistoryEventIdentities([{...entry,sourceSha256:'bad'}]).count,0);
});

test('alias discovery is read-only and requires independent approval for different IDs',()=>{
 const resolver=buildSourceBoundHistoryEventIdentities([entry]);
 const alias={...row,id:'sofa_123',status:'FT'};
 const result=resolver.findAliasCandidates(alias);
 assert.equal(result.ok,true);assert.equal(result.canonicalId,'cid_test');assert.equal(result.requiresIndependentIdentityApproval,true);
 assert.equal(resolver.resolveEvent(alias).ok,false);
 for(const patch of [{scoreHome:9},{scoreAway:null},{status:'NS'},{homeTeam:'Other'},{kickoff:'2026-09-01T19:00Z'},{leagueSlug:'eng.2'},{homeTeam:'Away',awayTeam:'Home'}])assert.equal(resolver.findAliasCandidates({...alias,...patch}).ok,false);
 const other={...entry,canonical:{...canonical,canonicalId:'cid_other'},final:{...final,matchId:'cid_other'}};
 assert.equal(buildSourceBoundHistoryEventIdentities([entry,other]).findAliasCandidates(alias).reason,'AMBIGUOUS_EVENT');
 assert.equal(buildSourceBoundHistoryEventIdentities([entry,entry]).resolveEvent(row).ok,false);
});

test('regular full-time provider status is accepted without admitting AET or PEN',()=>{
 const resolver=buildSourceBoundHistoryEventIdentities([entry]);
 assert.equal(resolver.findAliasCandidates({...row,status:'STATUS_FULL_TIME'}).ok,true);
 for(const status of ['AET','PEN','STATUS_FINAL_AET','STATUS_FINAL_PEN','POSTPONED'])assert.equal(resolver.findAliasCandidates({...row,status}).ok,false);
});

test('provider alias resolution requires explicit verified native binding, not semantic similarity',()=>{
 const boundCanonical={...canonical,providerIds:{...canonical.providerIds,sofascore:'123'}};
 const evidence={provider:'sofascore',providerMatchId:'123',finished:true,playedFinal:true,nonPlayedTerminal:false};
 const boundEntry={...entry,canonical:boundCanonical,final:{...final,sources:[evidence]}};
 const alias={...row,id:'sofa_123',status:'FT'};
 const result=buildSourceBoundHistoryEventIdentities([boundEntry]).resolveBoundProviderAlias(alias);
 assert.equal(result.ok,true);
 assert.equal(result.canonicalId,'cid_test');
 assert.equal(result.providerBindingVerified,true);
 assert.equal(result.requiresIndependentIdentityApproval,false);
 assert.equal(result.sourceHistoryRewriteAuthorized,false);
 assert.equal(result.canonicalResultRewriteAuthorized,false);
 for(const patch of [{id:'sofa_124'},{id:'unknown'},{scoreHome:9},{kickoff:'2026-09-01T18:01Z'},{status:'PEN'},{homeTeam:'Away',awayTeam:'Home'}])
  assert.equal(buildSourceBoundHistoryEventIdentities([boundEntry]).resolveBoundProviderAlias({...alias,...patch}).ok,false);
 assert.equal(buildSourceBoundHistoryEventIdentities([entry]).resolveBoundProviderAlias(alias).ok,false);
 for(const patch of [{finished:false},{playedFinal:false},{nonPlayedTerminal:true},{providerMatchId:'124'}])
  assert.equal(buildSourceBoundHistoryEventIdentities([{...boundEntry,final:{...final,sources:[{...evidence,...patch}]}}]).resolveBoundProviderAlias(alias).ok,false);
 assert.equal(buildSourceBoundHistoryEventIdentities([{...boundEntry,final}]).resolveBoundProviderAlias(alias).reason,'PROVIDER_FINAL_EVIDENCE_REQUIRED');
 const other={...boundEntry,canonical:{...boundCanonical,canonicalId:'cid_other',kickoffUtc:'2026-09-01T20:00Z'},final:{...boundEntry.final,matchId:'cid_other',kickoffUtc:'2026-09-01T20:00Z'}};
 assert.equal(buildSourceBoundHistoryEventIdentities([boundEntry,other]).resolveBoundProviderAlias(alias).reason,'PROVIDER_ID_NOT_UNIQUELY_BOUND');
});
