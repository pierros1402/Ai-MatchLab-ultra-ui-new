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
