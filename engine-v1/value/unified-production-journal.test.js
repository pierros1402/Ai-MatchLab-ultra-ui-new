import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnifiedShadow,signature} from './unified-shadow.js';
import {projectUnifiedProduction} from './unified-production-journal.js';
function record(time,ids,side='over'){
 const day='2099-12-30',kickoffUtc=day+'T19:00Z',sources={},plans={};
 for(const key of ['A','A2','B','B2']){
  const picks=ids.map(id=>({canonicalId:id,canonicalMatchId:id,matchId:id,kickoffUtc,market:'OU25',pick:side,score:.8,modelProb:.8,homeTeam:'H',awayTeam:'A'}));
  sources[key]={plan:{ok:true,date:day,generatedAt:time,count:picks.length,picks},audit:{ok:true,date:day,fixtureUniverse:{count:2,hash:'same'},evaluationAccounting:{complete:true,inputGapFixtures:0}}};plans[key]=sources[key].plan;
 }
 const observation=buildUnifiedShadow({day,now:time,sources,fixtures:['cid_one','cid_two'].map(canonicalId=>({canonicalId,kickoffUtc,status:'PRE'}))});
 const readiness={date:day,complete:true,status:'COMPLETE',summary:{fixtures:2,ready:2},rows:['cid_one','cid_two'].map(canonicalId=>({canonicalId,status:'READY',reasons:[],modelAssessmentAvailable:true}))};
 const body={schema:'ai-matchlab.unified-production-record.v1',date:day,observation,plans,readiness};return {...body,recordSignature:signature(body)};
}
test('an early zero cannot freeze the rest of the day; later captures add each new selection exactly once',()=>{
 const records=[record('2099-12-30T07:00Z',[]),record('2099-12-30T08:00Z',['cid_one']),record('2099-12-30T09:00Z',['cid_one','cid_two']),record('2099-12-30T10:00Z',[])];
 const result=projectUnifiedProduction('2099-12-30',records,{now:'2099-12-30T11:00Z',readiness:records[0].readiness});
 assert.equal(result.count,2);assert.equal(result.picks[0].firstObservedAt,'2099-12-30T08:00Z');assert.equal(result.picks[0].score,null);assert.equal(result.summary.unresolved,2);
});
test('later opposite sides do not rewrite an earlier published selection; modified evidence fails validation',()=>{
 const a=record('2099-12-30T08:00Z',['cid_one']),b=record('2099-12-30T09:00Z',['cid_one'],'under');
 const r=projectUnifiedProduction(a.date,[a,b],{now:'2099-12-30T10:00Z',readiness:a.readiness});assert.equal(r.count,1);assert.equal(r.picks[0].pick,'over');assert.equal(r.conflicts.length,1);
 b.plans.B.picks[0].modelProb=.99;assert.throws(()=>projectUnifiedProduction(a.date,[a,b]),/record_invalid/);
});
test('partial coverage never certifies a successful zero',()=>{
 const a=record('2099-12-30T08:00Z',[]);const r=projectUnifiedProduction(a.date,[a],{now:'2099-12-30T10:00Z',readiness:{...a.readiness,complete:false,status:'PARTIAL'}});assert.equal(r.zeroPicksCertified,false);assert.equal(r.analysisComplete,false);
});
