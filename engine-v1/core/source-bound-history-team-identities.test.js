import test from 'node:test';import assert from 'node:assert/strict';
import {buildSourceBoundHistoryTeamIdentities} from './source-bound-history-team-identities.js';
const row={leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',providerIds:{flashscore:'MATCH001'},archivedSourceEvidence:{providerMatchId:'MATCH001',homeProviderTeamId:'TEAM0001',awayProviderTeamId:'TEAM0002',sourceSha256:'a'.repeat(64),sourceUrl:'https://www.flashscore.com/match/MATCH001/'}};
test('archived native identities require exact provider/source bindings and never become global IDs',()=>{
 const map=buildSourceBoundHistoryTeamIdentities([row]);const r=map.resolveTeam('eng.1','Home');assert.equal(r.providerTeamId,'TEAM0001');assert.equal(r.globalClubId,undefined);
 assert.equal(map.resolveTeam('eng.2','Home').ok,false);
 for(const patch of [{sourceUrl:'https://other.test/match/MATCH001/'},{sourceSha256:'bad'},{providerMatchId:'OTHER001'}])assert.equal(buildSourceBoundHistoryTeamIdentities([{...row,archivedSourceEvidence:{...row.archivedSourceEvidence,...patch}}]).resolveTeam('eng.1','Home').ok,false);
});
test('conflicting source-native aliases remain unresolved',()=>{
 const map=buildSourceBoundHistoryTeamIdentities([row,{...row,archivedSourceEvidence:{...row.archivedSourceEvidence,homeProviderTeamId:'TEAM9999'}}]);assert.equal(map.resolveTeam('eng.1','Home').ok,false);assert.equal(map.resolveTeam('eng.1','Away').ok,true);
});
test('revalidated native feed identities retain their source URL and require exact competition and played-status scope',()=>{
 const feed={source:'flashscore-native-archive-feed',scoreBasis:'EXPLICIT_NATIVE_REGULAR_PLAYED_FINAL',providerStatus:{statusCode:'3',statusDetailCode:'3'},providerIds:{flashscore:'NATIVE01'},id:'NATIVE01',leagueSlug:'ger.1',leagueName:'Bundesliga',providerLeaguePath:'/football/germany/bundesliga/',homeTeam:'Home',awayTeam:'Away',homeProviderTeamId:'TEAM0001',awayProviderTeamId:'TEAM0002',sourceEvidence:{sha256:'a'.repeat(64),url:'https://www.flashscore.com/football/germany/bundesliga/results/'}};
 assert.equal(buildSourceBoundHistoryTeamIdentities([],[feed]).resolveTeam('ger.1','Home').providerTeamId,'TEAM0001');
 for(const patch of [{providerLeaguePath:'/football/england/premier-league/'},{providerStatus:{statusCode:'3',statusDetailCode:'10'}},{sourceEvidence:{sha256:'a'.repeat(64),url:'https://untrusted.test/result'}}])assert.equal(buildSourceBoundHistoryTeamIdentities([],[{...feed,...patch}]).resolveTeam('ger.1','Home').ok,false);
});
