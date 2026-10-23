import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMatchIntelligence,createMatchIntelligenceContext} from './build-match-intelligence.js';

const season='2026-2027';
const fixture={matchId:'cid_home_away_future',leagueSlug:'eng.1',homeTeam:'Home Club',awayTeam:'Away Club',dayKey:'2026-10-23',kickoffUtc:'2026-10-23T18:00Z'};
const past={id:'cid_past',leagueSlug:'eng.1',homeTeam:fixture.homeTeam,awayTeam:fixture.awayTeam,status:'FT',kickoff:'2026-10-01T18:00Z',scoreHome:2,scoreAway:0};
const stable=value=>{const {generatedAt,...body}=value;return body;};
function readers(historyRows=[],fixtureRows=[past]){
 const calls={standings:0,history:0,fixtures:0};
 return {calls,loaders:{standings:()=>{calls.standings++;return new Map();},history:()=>{calls.history++;return historyRows;},fixtures:()=>{calls.fixtures++;return fixtureRows;}}};
}

test('one invocation reuses input loads across 191 fixtures with identical per-fixture intelligence',async()=>{
 const fresh=readers(),batch=readers(),context=createMatchIntelligenceContext(season,batch.loaders);
 for(let i=0;i<191;i++){
  const row={...fixture,matchId:fixture.matchId+i};
  const expected=await buildMatchIntelligence(row,{season,context:createMatchIntelligenceContext(season,fresh.loaders)});
  const actual=await buildMatchIntelligence(row,{season,context});
  assert.deepEqual(stable(actual),stable(expected));
 }
 assert.deepEqual(fresh.calls,{standings:191,history:191,fixtures:191});
 assert.deepEqual(batch.calls,{standings:1,history:1,fixtures:1});
});

test('a new invocation reads changed source rows instead of retaining a process cache',async()=>{
 let rows=[past],loads=0;
 const loaders={standings:()=>new Map(),history:()=>{loads++;return rows;},fixtures:()=>{throw Error('history must avoid fallback');}};
 const first=createMatchIntelligenceContext(season,loaders);
 const old=await buildMatchIntelligence(fixture,{season,context:first});
 rows=[{...past,scoreHome:0,scoreAway:3}];
 assert.deepEqual(stable(await buildMatchIntelligence(fixture,{season,context:first})),stable(old));
 const next=await buildMatchIntelligence(fixture,{season,context:createMatchIntelligenceContext(season,loaders)});
 assert.notDeepEqual(next.formGuide,old.formGuide);assert.equal(loads,2);
});

test('invalid fixtures remain lazy, wrong-season contexts fail and failed input loads are never cached',async()=>{
 const data=readers(),context=createMatchIntelligenceContext(season,data.loaders);
 assert.deepEqual(await buildMatchIntelligence(null,{season,context}),{ok:false,error:'invalid_fixture'});
 assert.deepEqual(data.calls,{standings:0,history:0,fixtures:0});
 await assert.rejects(()=>buildMatchIntelligence(fixture,{season:'2025-2026',context}),/season_mismatch/);
 let calls=0;
 const retry=createMatchIntelligenceContext(season,{...data.loaders,standings:()=>{if(++calls===1)throw Error('source read failed');return new Map();}});
 await assert.rejects(()=>buildMatchIntelligence(fixture,{season,context:retry}),/source read failed/);
 assert.equal((await buildMatchIntelligence(fixture,{season,context:retry})).ok,true);assert.equal(calls,2);
});
