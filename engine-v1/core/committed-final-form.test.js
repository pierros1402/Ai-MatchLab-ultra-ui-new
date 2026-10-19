import test from 'node:test';import assert from 'node:assert/strict';
import {collectCommittedFinalForm} from './committed-final-form.js';
import {prospectiveValueFormView,readAvailableFinalForm} from './prospective-value-form-view.js';
import {evaluateMatchValue} from './value-engine-v1.js';
const now=Date.parse('2026-10-19T06:00Z');
const fixture={canonicalId:'cid_committed_final',dayKey:'2026-10-15',leagueSlug:'eng.1',leagueName:'Premier League',
 homeTeam:'Home',awayTeam:'Away',kickoffUtc:'2026-10-15T18:00Z',status:'FT',scoreHome:2,scoreAway:1,source:'espn',providerIds:{espn:'401123456'}};
const final={...fixture,schema:'ai-matchlab.verified-final-result.v1',matchId:fixture.canonicalId,verifiedFinalTruth:true,
 verdict:'verified_final_result',finalTruthVerdict:'verified_final_result',generatedAt:'2026-10-15T21:00Z'};
const collect=(c=fixture,f=final,base={})=>collectCommittedFinalForm(base,now,{fixturesForDay:day=>day===c.dayKey?[c]:[],finalForFixture:()=>f});

test('committed ESPN canonical final is readable without Flashscore research or raw-history mutation',()=>{
 const base={},before=JSON.stringify(base),result=collect(fixture,final,base);
 assert.equal(result.summary.accepted,1);assert.equal(result.index.Home.matches[0].id,fixture.canonicalId);
 assert.equal(result.index.Away.matches[0].scoreAway,1);assert.equal(JSON.stringify(base),before);
 assert.equal(result.index.Home.matches[0].source,'prematch_committed_verified_final');
});

test('unavailable, wrong, non-final and misrouted observations cannot enter the committed view',()=>{
 for(const [c,f] of [[fixture,null],[fixture,{...final,generatedAt:'2026-10-20T06:00Z'}],
 [fixture,{...final,schema:'unverified'}],[fixture,{...final,scoreHome:9}],
 [fixture,{...final,homeTeam:'Different'}],[fixture,{...final,verifiedFinalTruth:false,verdict:'unverified',finalTruthVerdict:'unverified'}],
 [{...fixture,status:'STATUS_POSTPONED'},final],[{...fixture,hasConflict:true},final],
 [{...fixture,leagueName:'Southern League Premier Central'},final],
 [{...fixture,kickoffUtc:'2026-10-20T18:00Z'},final]]){
  const result=collect(c,f);assert.equal(result.summary.accepted,0);assert.deepEqual(result.index,{});
 }
});

test('already indexed results do not count twice and contradictory stored scores block consumption',()=>{
 const row=collect().index.Home.matches[0];
 assert.equal(collect(fixture,final,{Home:{matches:[row]}}).summary.alreadyIndexed,1);
 assert.throws(()=>collect(fixture,final,{Home:{matches:[{...row,scoreHome:7}]}}),/history_score_conflict/);
});

test('identity continuity sees new committed records before building alternate-name views',()=>{
 const committed=collect(),base={Existing:{matches:[]}},before=JSON.stringify(base);
 const view=readAvailableFinalForm(base,now,{readCommitted:()=>committed,readResearched:augmented=>{
  assert.equal(augmented.Home.matches[0].id,fixture.canonicalId);
  return {index:{Alias:{matches:[{...augmented.Home.matches[0],homeTeam:'Alias'}]}},summary:{accepted:1}};
 }});
 assert.equal(view.index.Home.matches.length,1);assert.equal(view.index.Alias.matches.length,1);assert.equal(JSON.stringify(base),before);
});

test('the unchanged real Value gate can use three committed finals without any research file',async()=>{
 const canonical=[1,8,15].map(day=>({...fixture,canonicalId:`cid_committed_${day}`,dayKey:`2026-10-${String(day).padStart(2,'0')}`,
 kickoffUtc:`2026-10-${String(day).padStart(2,'0')}T18:00Z`}));
 const finals=canonical.map(c=>({...final,matchId:c.canonicalId,dayKey:c.dayKey,kickoffUtc:c.kickoffUtc,generatedAt:`${c.dayKey}T21:00Z`}));
 const reader=(base,cutoff)=>collectCommittedFinalForm(base,cutoff,{fixturesForDay:day=>canonical.filter(c=>c.dayKey===day),finalForFixture:(_,id)=>finals.find(f=>f.matchId===id)});
 const view=prospectiveValueFormView({teamForm:{},leagueForm:{},matchups:{}},'2026-2027',now,{readFinalForm:reader});
 const value=await evaluateMatchValue({leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoff:'2026-10-19T19:00Z'},
 {season:'2026-2027',indexes:view,priors:{teamPriors:{},leaguePriors:{},matchupPriors:{}},returnNullDiagnostics:true});
 assert.ok(value&&!value.__valueNullDiagnostic);assert.equal(value.meta.recency.homeOverall.rawSample,3);assert.equal(value.meta.recency.awayOverall.rawSample,3);
});
