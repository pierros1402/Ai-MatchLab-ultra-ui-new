import test from 'node:test';import assert from 'node:assert/strict';
import {scoreTeamNameMatch,evaluateMatchValue,diagnoseValueRecentSample,scopeValueFormEntry} from './value-engine-v1.js';

test('a character substring cannot bind Estudiantes to UDI 19',()=>{
 assert.equal(scoreTeamNameMatch('Estudiantes (Buenos Aires)','UDI 19'),0);
 assert.equal(scoreTeamNameMatch('UDI 19','Estudiantes (Buenos Aires)'),0);
 assert.equal(scoreTeamNameMatch('Barcelona','Barcelona B'),0);
 assert.equal(scoreTeamNameMatch('Ajax','Ajax U21'),0);
 assert.equal(scoreTeamNameMatch('Celta Vigo','Celta Vigo W'),0);
 assert.ok(scoreTeamNameMatch('Tottenham Hotspur','Tottenham')>=.9);
 assert.equal(scoreTeamNameMatch('Estudiantes (Buenos Aires)','Estudiantes (Buenos Aires)'),1);
});

test('three unrelated UDI observations cannot fill the real Estudiantes sample gate',async()=>{
 const matches=team=>[1,8,15].map(day=>({id:`cid_${team.replace(/\W/g,'')}_${day}`,leagueSlug:'ned.3',homeTeam:team,awayTeam:'Opponent',
 kickoff:`2026-10-${String(day).padStart(2,'0')}T12:00Z`,scoreHome:2,scoreAway:1}));
 const result=await evaluateMatchValue({leagueSlug:'arg.2',homeTeam:'Home',awayTeam:'Estudiantes (Buenos Aires)',kickoff:'2026-10-19T18:30Z'},
 {season:'2026-2027',indexes:{teamForm:{Home:{matches:matches('Home')},'UDI 19':{matches:matches('UDI 19')}},leagueForm:{},matchups:{}},
 priors:{teamPriors:{},leaguePriors:{},matchupPriors:{}},returnNullDiagnostics:true});
 assert.equal(result.reason,'minimum_recent_sample');assert.equal(result.minimumRecentSample.awayResolvedKey,'Estudiantes (Buenos Aires)');
 assert.equal(result.minimumRecentSample.awayRawSample,0);
});

test('read-only sample census has the same raw gate and identities as the evaluator',async()=>{
 const input={leagueSlug:'arg.2',homeTeam:'Home',awayTeam:'Estudiantes (Buenos Aires)',kickoff:'2026-10-19T18:30Z'};
 const indexes={teamForm:{},leagueForm:{},matchups:{}};
 const census=diagnoseValueRecentSample(input,indexes,'2026-2027');
 const value=await evaluateMatchValue({...input},{season:'2026-2027',indexes,priors:{},returnNullDiagnostics:true});
 assert.equal(census.ok,false);assert.equal(census.homeRawSample,value.minimumRecentSample.homeRawSample);
 assert.equal(census.awayRawSample,value.minimumRecentSample.awayRawSample);assert.equal(census.awayResolvedKey,value.minimumRecentSample.awayResolvedKey);
 assert.equal(census.predictionCreated,false);
});

test('Liverpool Uruguay and River Plate Argentina cannot inherit namesake domestic results',()=>{
 for(const [team,league,foreign] of [['Liverpool','uru.1','eng.1'],['River Plate','arg.1','uru.2']]){
  const entry={matches:[{id:'local',leagueSlug:league,homeTeam:team,awayTeam:'Other'},
    {id:'foreign',leagueSlug:foreign,homeTeam:'Other',awayTeam:team}]};
  assert.deepEqual(scopeValueFormEntry(entry,team,league).matches.map(r=>r.id),['local']);
  assert.equal(entry.matches.length,2);
 }
});

test('explicit club IDs are a cross-competition proof and a mismatch veto',()=>{
 const entry={matches:[{id:'continental',leagueSlug:'uefa.champions',homeTeam:'Liverpool',awayTeam:'Other',homeGlobalClubId:'english-club'},
  {id:'wrong-id',leagueSlug:'eng.1',homeTeam:'Liverpool',awayTeam:'Other',homeGlobalClubId:'different-club'}]};
 assert.deepEqual(scopeValueFormEntry(entry,'Liverpool','eng.1','english-club').matches.map(r=>r.id),['continental']);
 assert.deepEqual(scopeValueFormEntry(entry,'Liverpool','uru.1','uruguayan-club').matches,[]);
});

test('continental same-name ambiguity requires explicit club identity',()=>{
 const entry={matches:[{id:'english',leagueSlug:'eng.1',homeTeam:'Liverpool',awayTeam:'Other'},
  {id:'uruguayan',leagueSlug:'uru.1',homeTeam:'Liverpool',awayTeam:'Other'}]};
 assert.deepEqual(scopeValueFormEntry(entry,'Liverpool','uefa.champions').matches,[]);
});

test('same-competition continental finals remain usable while ambiguous foreign domestic history stays excluded',()=>{
 const entry={matches:[{id:'own',leagueSlug:'uefa.champions',homeTeam:'Liverpool',awayTeam:'Other'},
  {id:'english',leagueSlug:'eng.1',homeTeam:'Liverpool',awayTeam:'Other'},
  {id:'uruguayan',leagueSlug:'uru.1',homeTeam:'Liverpool',awayTeam:'Other'}]};
 assert.deepEqual(scopeValueFormEntry(entry,'Liverpool','uefa.champions').matches.map(r=>r.id),['own']);
 const managed={matches:[{...entry.matches[0],homeGlobalClubId:'wrong-club'}]};
 assert.deepEqual(scopeValueFormEntry(managed,'Liverpool','uefa.champions','expected-club').matches,[]);
 const conflicting={matches:[{...entry.matches[0],homeGlobalClubId:'club-one'},
  {...entry.matches[0],id:'conflict',homeGlobalClubId:'club-two'}]};
 assert.deepEqual(scopeValueFormEntry(conflicting,'Liverpool','uefa.champions').matches,[]);
});

test('three real same-competition continental matches satisfy the unchanged actual Value gate',async()=>{
 const matches=[1,8,15].map(day=>({id:`cid_own_continental_${day}`,leagueSlug:'uefa.champions',homeTeam:'Home',awayTeam:'Away',
  kickoff:`2026-10-${String(day).padStart(2,'0')}T12:00Z`,season:'2026-2027',scoreHome:2,scoreAway:1}));
 const input={leagueSlug:'uefa.champions',homeTeam:'Home',awayTeam:'Away',kickoff:'2026-10-21T18:30Z'};
 const indexes={teamForm:{Home:{matches},Away:{matches}},leagueForm:{},matchups:{}};
 const census=diagnoseValueRecentSample(input,indexes,'2026-2027');
 assert.equal(census.ok,true);assert.equal(census.homeRawSample,3);assert.equal(census.awayRawSample,3);
 const value=await evaluateMatchValue(input,{season:'2026-2027',indexes,priors:{teamPriors:{},leaguePriors:{},matchupPriors:{}},returnNullDiagnostics:true});
 assert.ok(value&&!value.__valueNullDiagnostic);assert.equal(value.meta.recency.homeOverall.rawSample,3);
 assert.equal(census.predictionCreated,false);
});

test('isolated continental spelling cannot displace the established domestic club anchor',()=>{
 const domestic=[1,8,15].map(day=>({id:`cid_viking_${day}`,leagueSlug:'nor.1',homeTeam:'Viking FK',awayTeam:'Other',kickoff:`2026-10-${String(day).padStart(2,'0')}T12:00Z`,season:'2026-2027',scoreHome:2,scoreAway:1}));
 const stale={id:'cid_viking_old',leagueSlug:'uefa.champions',homeTeam:'Viking (Nor)',awayTeam:'Other',kickoff:'2026-08-01T12:00Z',season:'2026-2027',scoreHome:1,scoreAway:0};
 const input={leagueSlug:'uefa.champions',homeTeam:'Other',awayTeam:'Viking (Nor)',kickoff:'2026-10-21T18:30Z'};
 const indexes={teamForm:{'Viking FK':{matches:domestic},'Viking (Nor)':{matches:[stale]}},leagueForm:{},matchups:{}};
 const census=diagnoseValueRecentSample(input,indexes,'2026-2027');
 assert.equal(census.awayResolvedKey,'Viking FK');assert.equal(census.awayRawSample,3);
 assert.deepEqual(indexes.teamForm['Viking (Nor)'].matches,[stale]);
});

test('known Simba SC cannot inherit the distinctive Simba Bhora namesake sample',()=>{
 const other=[1,8,15].map(day=>({id:`cid_bhora_${day}`,leagueSlug:'zim.1',homeTeam:'Simba Bhora',awayTeam:'Other',kickoff:`2026-10-${String(day).padStart(2,'0')}T12:00Z`,season:'2026-2027',scoreHome:2,scoreAway:1}));
 const own={id:'cid_simba_old',leagueSlug:'caf.champions',homeTeam:'Simba SC',awayTeam:'Other',kickoff:'2026-09-13T13:00Z',season:'2026-2027',scoreHome:6,scoreAway:1};
 const indexes={teamForm:{'Simba Bhora':{matches:other},'Simba SC':{matches:[own]}},leagueForm:{},matchups:{}};
 const census=diagnoseValueRecentSample({leagueSlug:'caf.champions',homeTeam:'Other',awayTeam:'Simba SC',kickoff:'2026-10-21T12:00Z'},indexes,'2026-2027');
 assert.equal(census.awayResolvedKey,'Simba SC');assert.equal(census.awayRawSample,0);assert.equal(census.ok,false);
 assert.equal(indexes.teamForm['Simba Bhora'].matches.length,3);
});
