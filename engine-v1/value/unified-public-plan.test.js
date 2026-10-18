import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnifiedShadow,signature,specSha256} from './unified-shadow.js';
import {buildUnifiedPublicPlan} from './unified-public-plan.js';
function fixture(){
 const day='2099-12-30',now=day+'T07:00:00Z',kickoffUtc=day+'T15:00:00Z',id='cid_test';
 const sources={},plans={};
 for(const k of ['A','A2','B','B2']){
  const p={canonicalId:id,matchId:id,canonicalMatchId:id,kickoffUtc,market:'OU25',pick:'over',score:.8,modelProb:.79,homeTeam:'Home',awayTeam:'Away',result:'UNRESOLVED'};
  sources[k]={plan:{ok:true,date:day,generatedAt:now,count:1,picks:[p]},audit:{ok:true,date:day,fixtureUniverse:{count:1,hash:'same'},evaluationAccounting:{complete:true,inputGapFixtures:0}}};
  plans[k]={picks:[p]};
 }
 return {day,plans,observation:buildUnifiedShadow({day,now,sources,fixtures:[{canonicalId:id,kickoffUtc,status:'SCHEDULED'}],inputFiles:[]})};
}
function resign(o){delete o.observationSignature;o.observationSignature=signature(o);}
test('publishes one deduplicated public plan without presenting a fused probability',()=>{
 const f=fixture(),r=buildUnifiedPublicPlan(f.day,f.observation,f.plans);
 assert.equal(r.status,'AVAILABLE');assert.equal(r.count,1);assert.equal(r.picks[0].homeTeam,'Home');
 assert.equal(r.picks[0].score,null);assert.equal(r.combinedCalibratedProbability,null);assert.equal(r.performanceCertified,false);
 assert.equal(r.summary.unresolved,1);assert.equal(r.summary.hitRate,null);
});
test('historical dates stay outside the public activation and missing data is unavailable, not zero',()=>{
 assert.equal(buildUnifiedPublicPlan('2026-10-17',null,{}),null);
 assert.equal(buildUnifiedPublicPlan('2026-10-18',null,{}).status,'NOT_AVAILABLE');
});
test('tampered, wrong-day and duplicate observations cannot be published',()=>{
 for(const type of ['tamper','day','duplicate','late','threshold','conflict']){
  const f=fixture(),o=f.observation;
  if(type==='tamper')o.count=2;
  if(type==='day')o.date='2099-12-29';
  if(type==='duplicate'){o.picks.push({...o.picks[0]});o.count=2;}
  if(type==='late')o.generatedAt=o.picks[0].kickoffUtc;
  if(type==='threshold')o.picks[0].sourceScores={A:.74,A2:.8};
  if(type==='conflict'){o.picks.push({...o.picks[0],pick:'under'});o.count=2;}
  if(type!=='tamper')resign(o);
  assert.equal(buildUnifiedPublicPlan(f.day,o,f.plans).status,'NOT_AVAILABLE',type);
 }
});
test('keeps incomplete coverage visible and counts results once across correlated variants',()=>{
 const f=fixture();f.observation.upstreamCoverage='INCOMPLETE';resign(f.observation);
 for(const p of Object.values(f.plans))p.picks[0].result='WIN';
 const o=f.observation,p=o.picks[0],results={schema:'ai-matchlab.unified-shadow-results.v1',date:f.day,candidateId:o.candidateId,specSha256,
  observations:[{date:f.day,signature:o.observationSignature,timing:{status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:'a'.repeat(40),committedAt:f.day+'T08:00:00Z'}}],
  rows:[{key:[o.observationSignature,'U1',p.canonicalMatchId,p.market,p.pick].join('|'),date:f.day,group:'U1',result:'WIN',truth:{scoreHome:2,scoreAway:1}}]};
 results.reportSignature=signature(results);
 const r=buildUnifiedPublicPlan(f.day,f.observation,f.plans,results);
 assert.equal(r.upstreamCoverage,'INCOMPLETE');assert.equal(r.summary.wins,1);assert.equal(r.summary.settled,1);
 assert.equal(buildUnifiedPublicPlan(f.day,f.observation,f.plans).summary.wins,0);
 results.observations[0].timing.committedAt=p.kickoffUtc;delete results.reportSignature;results.reportSignature=signature(results);
 assert.equal(buildUnifiedPublicPlan(f.day,f.observation,f.plans,results).summary.wins,0);
});
test('missing or contradictory comparison settlements fail closed',()=>{
 const f=fixture();assert.equal(buildUnifiedPublicPlan(f.day,f.observation,{}).status,'NOT_AVAILABLE');
 f.plans.A.picks[0].result='WIN';f.plans.B.picks[0].result='LOSS';
 assert.equal(buildUnifiedPublicPlan(f.day,f.observation,f.plans).status,'NOT_AVAILABLE');
});
