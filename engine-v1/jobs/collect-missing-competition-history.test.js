import test from 'node:test';import assert from 'node:assert/strict';
import {archivedSeasonLinks,validateObservedFeedResult} from './collect-missing-competition-history.js';
test('provider archive JSON supplies exact current and historical links without evaluating scripts',()=>{
 const html='window.league_archive_data = '+JSON.stringify({seasons:[{name:'League 2026/2027',url:'/football/germany/bundesliga/'},{name:'League 2025/2026',url:'/football/germany/bundesliga-2025-2026/'},{name:'Other 2024/2025',url:'https://evil.test/other/'}]})+';';
 const links=archivedSeasonLinks(html,'/football/germany/bundesliga/');assert.equal(links.get('2026-2027'),'/football/germany/bundesliga/');assert.equal(links.get('2025-2026'),'/football/germany/bundesliga-2025-2026/');assert.equal(links.has('2024-2025'),false);
});
test('observed archive admission excludes nonplayed, incomplete, wrong-season and completed UEFA recovery scope',()=>{
 const r={matchId:'NATIVE01',leaguePath:'/football/germany/bundesliga/',leagueName:'Bundesliga',home:'Home',away:'Away',homeProviderTeamId:'TEAM0001',awayProviderTeamId:'TEAM0002',kickoffUtc:'2026-10-01T16:00Z',scoreHome:2,scoreAway:0,playedFinal:true,statusCode:'3',statusDetailCode:'3'};
 const o={slug:'ger.1',season:'2026-2027',nowMs:Date.parse('2026-11-15T00:00Z')};assert.equal(validateObservedFeedResult(r,o).ok,true);
 for(const patch of [{scoreHome:null},{statusDetailCode:'10'},{playedFinal:false},{leaguePath:'/football/england/premier-league/'}])assert.equal(validateObservedFeedResult({...r,...patch},o).ok,false);
 assert.equal(validateObservedFeedResult(r,{...o,season:'2025-2026'}).ok,false);assert.equal(validateObservedFeedResult(r,{...o,slug:'uefa.nations'}).ok,false);
});
