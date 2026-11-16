import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildUnifiedProductionDay} from './build-unified-production-day.js';
import {athensDayKey,shiftDay} from '../core/daykey.js';
import {buildAutonomousPreview} from '../value/autonomous-preview.js';
test('producer isolates all candidate writes, survives an initial zero and commits only material captures',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'matchlab-production-capture-'));
 const base=new Date(),today=athensDayKey(base),day=shiftDay(today,1),kickoffUtc=day+'T19:00Z';
 let now=base.toISOString(),withPick=false,calls=0,autonomousCalls=0,preview=null;const formCutoffs=[];
 const fixture={canonicalId:'cid_capture',leagueSlug:'eng.1',homeTeam:'H',awayTeam:'A',kickoffUtc,status:'PRE'};
 const emit=(universe)=>{
  const pick={canonicalId:'cid_capture',canonicalMatchId:'cid_capture',matchId:'cid_capture',market:'OU25',pick:'over',kickoffUtc,score:.8,modelProb:.8,homeTeam:'H',awayTeam:'A'};
  return {
   result:{ok:true,date:day,generatedAt:now,count:withPick?1:0,picks:withPick?[pick]:[]},
   audit:{ok:true,date:day,fixtureUniverse:{schema:universe.schema,source:universe.source,count:universe.count,hash:universe.hash,canonicalIds:universe.canonicalIds},evaluationAccounting:{complete:true,inputGapFixtures:0}}
  };
 };
 const readiness={date:day,complete:true,status:'COMPLETE',summary:{fixtures:1,ready:1},rows:[{canonicalId:'cid_capture',status:'READY',reasons:[],modelAssessmentAvailable:true}]};
 const dependencies={root,detailsAudit:()=>({ok:true}),fixtures:()=>[fixture],buildA:async(d,options)=>{calls++;assert.equal(options.prospectiveOnly,true);assert.equal(options.computeOnly,true);assert.equal(options.outputPath,undefined);assert.ok(Number.isSafeInteger(options.commonFormAsOfMs));formCutoffs.push(options.commonFormAsOfMs);const u=options.buildUniverse(d);assert.deepEqual(u.fixtures,[fixture]);const out=emit(u);if(options.autonomousResearch){autonomousCalls++;out.autonomousResearch={status:'RESEARCH_ONLY_NOT_POLICY_APPROVED',rows:[{canonicalMatchId:'cid_capture',research:{status:'RESEARCH_ONLY',inputDigest:'a'.repeat(64),variants:{combined:{probabilities:{home:.8,draw:.1,away:.1,over25:.8,btts:.75}}}}}]};}return out;},
  buildB:(d,options)=>{calls++;assert.ok(options.publicationRunId);assert.equal(options.computeOnly,true);const u=options.buildUniverse(d);assert.deepEqual(u.fixtures,[fixture]);return emit(u);},coverage:async()=>{},readiness:()=>readiness,
  checkpoint:()=>{},finals:()=>({rows:[],canonicalById:new Map(),canonicalIdentityAmbiguities:[]}),proof:()=>({status:'UNPROVEN'})};
 try{
  assert.equal((await buildUnifiedProductionDay(day,{nowFn:()=>now,dependencies,onAutonomousResearch:input=>{preview=buildAutonomousPreview(input,now);}})).count,0);
  assert.equal(autonomousCalls,1);assert.equal(preview.count,3);assert.equal(preview.publicationAuthorized,false);assert.equal(calls,4);assert.equal(formCutoffs[0],formCutoffs[1]);
  withPick=true;now=new Date(base.getTime()+60000).toISOString();
  const next=await buildUnifiedProductionDay(day,{nowFn:()=>now,dependencies});assert.equal(next.count,1);assert.equal(next.records,2);
  now=new Date(base.getTime()+120000).toISOString();assert.equal((await buildUnifiedProductionDay(day,{nowFn:()=>now,dependencies})).records,2);
  assert.equal(calls,12);for(let i=0;i<formCutoffs.length;i+=2)assert.equal(formCutoffs[i],formCutoffs[i+1]);assert.equal(fs.existsSync(path.join(root,'scratch')),false);
  const finalFile=path.join(root,'verified-final.json');
  fs.writeFileSync(finalFile,JSON.stringify({kickoffUtc,verification:{generatedAt:day+'T21:00Z'}}));
  dependencies.finals=()=>({rows:[{matchId:'cid_capture',date:day,path:finalFile,homeScore:3,awayScore:0}],canonicalById:new Map([['cid_capture',fixture]]),canonicalIdentityAmbiguities:[]});
  dependencies.proof=()=>({status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:'a'.repeat(40),committedAt:day+'T08:00Z'});
  const settled=await buildUnifiedProductionDay(day,{capture:false,nowFn:()=>day+'T22:00Z',dependencies});
  assert.equal(settled.count,1);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'public-plan.json'))).summary.wins,1);
  dependencies.proof=()=>({status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:'a'.repeat(40),committedAt:day+'T20:00Z'});
  await buildUnifiedProductionDay(day,{capture:false,nowFn:()=>day+'T22:01Z',dependencies});
  const preserved=JSON.parse(fs.readFileSync(path.join(root,'public-plan.json')));assert.equal(preserved.summary.wins,1);assert.ok(preserved.conflicts.some(c=>c.reason==='settlement_truth_changed_existing_result_preserved'));

  const originalRead=dependencies.fixtures;let reads=0;
  dependencies.fixtures=()=>++reads===1?[fixture]:[{...fixture,status:'LIVE'}];
  await assert.rejects(buildUnifiedProductionDay(day,{nowFn:()=>now,dependencies}),/canonical_input_changed_during_capture/);
  assert.equal(fs.readdirSync(path.join(root,'observations')).length,2);
  dependencies.fixtures=originalRead;
  const beforeStale=calls;dependencies.detailsAudit=()=>({ok:false});await assert.rejects(buildUnifiedProductionDay(day,{nowFn:()=>now,dependencies}),/details_foundation_not_verified/);assert.equal(calls,beforeStale);
  const before=calls;await assert.rejects(buildUnifiedProductionDay(shiftDay(today,-1),{nowFn:()=>now,dependencies}),/prospective_window|invalid_unified_production_day/);assert.equal(calls,before);
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
