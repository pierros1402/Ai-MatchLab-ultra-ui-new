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
