import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildUnifiedShadow,signature} from '../value/unified-shadow.js';
import {buildValueFixtureUniverse,valueFixtureUniverseContract} from './value-fixture-universe.js';
import {applyPrematchReadinessEvidence} from './prematch-readiness-evidence.js';
import {buildValueDataReadinessDay} from '../jobs/build-value-data-readiness-day.js';

const day='2099-12-30';
const fixture={canonicalId:'cid_one',leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoffUtc:day+'T19:00Z',status:'PRE'};
const universe=valueFixtureUniverseContract(buildValueFixtureUniverse(day,{fixtures:[fixture]}));
function current(overrides={}) {
  return {date:day,generatedAt:day+'T20:00Z',fixtureUniverse:universe,complete:false,status:'INSUFFICIENT_DATA',
    allLeagueDataCertified:false,sourcePolicy:{thresholdsChanged:false},
    summary:{fixtures:1,applicable:1,ready:0,insufficient:1,byReason:{minimum_recent_sample:1}},
    rows:[{canonicalId:fixture.canonicalId,leagueSlug:fixture.leagueSlug,kickoffUtc:fixture.kickoffUtc,
      status:'INSUFFICIENT_DATA',reasons:['minimum_recent_sample'],modelAssessmentAvailable:true,
      recentHistory:{homeRawSample:1,awayRawSample:2},...overrides}]};
}
function record(time=day+'T18:00Z',overrides={}) {
  const sources={},plans={};
  for(const key of ['A','A2','B','B2']){
    sources[key]={plan:{ok:true,date:day,generatedAt:time,count:0,picks:[]},
      audit:{ok:true,date:day,fixtureUniverse:{count:1,hash:universe.hash},evaluationAccounting:{complete:true,inputGapFixtures:0}}};
    plans[key]=sources[key].plan;
  }
  const rawUtf8=JSON.stringify([fixture]);
  const inputFiles=[{path:'canonical-fixture-read-view.json',sha256:crypto.createHash('sha256').update(rawUtf8).digest('hex'),bytes:Buffer.byteLength(rawUtf8),rawUtf8}];
  const observation=buildUnifiedShadow({day,now:time,sources,fixtures:[fixture],inputFiles});
  const readiness={date:day,generatedAt:time,fixtureUniverse:universe,rows:[{...current().rows[0],status:'READY',reasons:[],recentHistory:null}]};
  const body={schema:'ai-matchlab.unified-production-record.v1',date:day,observation,plans,readiness,...overrides};
  return {...body,recordSignature:signature(body)};
}

test('signed pre-match readiness survives later sample-only diagnostic drift without changing inputs or observations',()=>{
  const source=record(),report=current(),snapshot=JSON.stringify({source,report});
  const result=applyPrematchReadinessEvidence(report,[fixture],[source]);
  assert.equal(result.rows[0].status,'READY');assert.equal(result.summary.ready,1);
  assert.equal(result.rows[0].prematchEvidence.recordSignature,source.recordSignature);
  assert.deepEqual(result.rows[0].currentDiagnostic.recentHistory,{homeRawSample:1,awayRawSample:2});
  assert.equal(result.rows[0].recentHistory,null);assert.equal(result.allLeagueDataCertified,false);
  assert.equal(result.prematchEvidence.predictionCreated,false);
  assert.equal(JSON.stringify({source,report}),snapshot);
});
test('future fixtures and captures at or after the pre-match boundary cannot be promoted',()=>{
  const future=current();future.generatedAt=day+'T18:30Z';
  assert.equal(applyPrematchReadinessEvidence(future,[fixture],[record()]).summary.ready,0);
  for(const time of [day+'T18:59:30Z',day+'T19:00Z',day+'T19:30Z'])
    assert.equal(applyPrematchReadinessEvidence(current(),[fixture],[record(time)]).summary.ready,0);
});
test('tampered records and copied fixture bytes fail validation',()=>{
  for(const mutate of [r=>{r.readiness.rows[0].status='BROKEN';},r=>{r.observation.inputFiles[0].rawUtf8='[]';}]){
    const source=record();mutate(source);const result=applyPrematchReadinessEvidence(current(),[fixture],[source]);
    assert.equal(result.summary.ready,0);assert.equal(result.prematchEvidence.invalidRecords,1);
  }
});
test('changed teams, kickoff, league or ambiguous current membership cannot reuse earlier evidence',()=>{
  for(const fixtures of [[{...fixture,homeTeam:'Other'}],[{...fixture,kickoffUtc:day+'T19:30Z'}],
    [{...fixture,leagueSlug:'uru.1'}],[fixture,fixture]]){
    assert.equal(applyPrematchReadinessEvidence(current(),fixtures,[record()]).summary.ready,0);
  }
  const report=current();report.fixtureUniverse={...universe,hash:'changed'};
  assert.equal(applyPrematchReadinessEvidence(report,[fixture],[record()]).summary.ready,0);
});
test('current model, details and exclusion problems cannot be hidden by a prior ready row',()=>{
  for(const override of [{modelAssessmentAvailable:false},{reasons:['minimum_recent_sample','missing_model_assessment']},
    {reasons:['minimum_recent_sample','details_foundation_not_verified']},{status:'NOT_APPLICABLE',reasons:[]}]){
    assert.equal(applyPrematchReadinessEvidence(current(override),[fixture],[record()]).rows[0].status,current(override).rows[0].status);
  }
});
test('a record with readiness assessed after capture cannot certify earlier availability',()=>{
  const source=record();source.readiness.generatedAt=day+'T19:30Z';
  const {recordSignature,...body}=source;source.recordSignature=signature(body);
  assert.equal(applyPrematchReadinessEvidence(current(),[fixture],[source]).summary.ready,0);
});
test('certified raw sample evidence never removes a missing model assessment',()=>{
  const source=record();
  Object.assign(source.readiness.rows[0],{status:'INSUFFICIENT_DATA',reasons:['missing_model_assessment'],modelAssessmentAvailable:false});
  const {recordSignature,...body}=source;source.recordSignature=signature(body);
  const report=current({reasons:['minimum_recent_sample','missing_model_assessment'],modelAssessmentAvailable:false});
  const result=applyPrematchReadinessEvidence(report,[fixture],[source]);
  assert.equal(result.rows[0].status,'INSUFFICIENT_DATA');assert.equal(result.rows[0].modelAssessmentAvailable,false);
  assert.deepEqual(result.rows[0].reasons,['missing_model_assessment']);assert.equal(result.summary.ready,0);
});
test('the real readiness job consumes archived evidence only after building current diagnostics',()=>{
  const result=buildValueDataReadinessDay(day,{dependencies:{
    fixtures:()=>[fixture],now:day+'T20:00Z',
    coverage:()=>({dayKey:day,source:{fixtureUniverse:universe},rows:[{matchId:fixture.canonicalId,detailsFound:true,valueReturned:false,nullReason:'minimum_recent_sample'}]}),
    assessments:()=>({matches:[{...fixture,aiAssessment:{markets:{OU25:{probs:{over:.8,under:.2}}}}}]}),
    standings:()=>({ok:false}),detailsAudit:()=>({ok:true,issues:[]}),prematchRecords:()=>[record()]
  }});
  assert.equal(result.rows[0].status,'READY');assert.equal(result.prematchEvidence.preservedRows,1);
  assert.deepEqual(result.rows[0].currentDiagnostic.reasons,['minimum_recent_sample']);
  assert.equal(result.sourcePolicy.thresholdsChanged,false);
});
