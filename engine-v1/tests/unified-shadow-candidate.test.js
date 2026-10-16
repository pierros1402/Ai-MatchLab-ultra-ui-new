import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildUnifiedShadow,validateUnifiedShadow,unifiedSpec,signature,specSha256} from '../value/unified-shadow.js';
import {captureUnifiedShadow,runUnifiedShadowDay,refreshUnifiedShadowResults} from '../jobs/capture-unified-shadow-day.js';
import {preserveHistoryCheckpoint,restoreHistoryCheckpoint} from '../storage/history-preservation.js';

const day='2099-12-30',now='2099-12-30T07:00:00.000Z',kickoff='2099-12-30T15:00:00.000Z';
const cid='cid_test_home_away_20991230';
const clone=v=>JSON.parse(JSON.stringify(v));
const noop=()=>({enabled:false});
function sample(){
  const fixture={canonicalId:cid,matchId:cid,kickoffUtc:kickoff,status:'SCHEDULED',leagueSlug:'test.1'};
  const sources={};
  for(const p of ['A','A2','B','B2']) {
    const pick={canonicalId:cid,matchId:cid,kickoffUtc:kickoff,market:p.startsWith('A')?'Over / Under 2.5':'OU25',
      pick:p.startsWith('A')?'Over 2.5':'over',score:.80,modelProb:.79,confidence:p.startsWith('A')?.78:'high'};
    sources[p]={plan:{ok:true,date:day,generatedAt:'2099-12-30T06:00:00.000Z',count:1,picks:[pick]},
      audit:{ok:true,date:day,fixtureUniverse:{count:1,hash:'same'},
        evaluationAccounting:{complete:true,inputGapFixtures:0,unaccountedFixtureCount:0,duplicateOutcomeCount:0,
          terminalOutcomeCount:1,evaluatedFixtureCount:1}}};
  }
  return {day,now,sources,fixtures:[fixture]};
}
const build=modify=>{const s=sample();modify?.(s);return buildUnifiedShadow(s);};
function disk(t,s=sample()){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'matchlab-unified-test-')),dataRoot=path.join(root,'data');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(relative,value)=>{const f=path.join(dataRoot,relative);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(value,null,2)+'\n');return f;};
  for(const [p,source] of Object.entries(s.sources)){
    write(`value-plans/${day}/plan-${p.toLowerCase()}.json`,source.plan);
    write(`value-plans/${day}/plan-${p.toLowerCase()}-audit.json`,source.audit);
  }
  write(`value/_audit/${day}.json`,s.sources.A.audit);
  write(`canonical-fixtures/${day}/test.1.json`,{fixtures:s.fixtures});
  return {root,dataRoot,write,file:path.join(dataRoot,'value-plans',day,`${unifiedSpec.candidateId}.json`)};
}
function initGit(root){
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  git(['init','-b','main']);git(['config','core.autocrlf','false']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);
  fs.writeFileSync(path.join(root,'source.txt'),'test\n');git(['add','.']);git(['commit','-m','baseline']);return git;
}
function finalTruth(){return {schema:'ai-matchlab.verified-final-result.v1',verifiedFinalTruth:true,
  matchId:cid,date:day,kickoffUtc:kickoff,verdict:'verified_final_result',source:'independent_test_truth',
  sourceCount:1,independentSourceCount:1,finalScore:{homeScore:2,awayScore:1,scoreKey:'2-1'},
  verification:{sourceCount:1,independentSourceCount:1,verdict:'verified_final_result'}};}
const proven=()=>({status:'ORIGINAL_COMMITTED_BYTES_VERIFIED',commit:'1'.repeat(40),committedAt:now});

test('two family pairs yield one market and preserve four scores without inventing a probability',()=>{
  const o=build();assert.equal(o.count,1);assert.deepEqual(o.picks[0].families,['statistical','assessment']);
  assert.deepEqual(o.picks[0].sourceScores,{A:.8,A2:.8,B:.79,B2:.79});
  assert.equal(o.combinedCalibratedProbability,null);assert.equal(o.baselineSelections.B[0].confidence,'high');
  assert.equal(validateUnifiedShadow(o),o);
});
test('one eligible family is sufficient and related variants are not counted as independent votes',()=>{
  const o=build(s=>{for(const p of ['B','B2']){s.sources[p].plan.picks=[];s.sources[p].plan.count=0;}});
  assert.equal(o.count,1);assert.deepEqual(o.picks[0].families,['statistical']);
});
test('both variant scores must meet the fixed floor and single-variant evidence is rejected',()=>{
  const o=build(s=>{s.sources.A2.plan.picks[0].score=.749;s.sources.B2.plan.picks[0].modelProb=.74;});
  assert.equal(o.count,0);assert.equal(o.selectionStatus,'ZERO_AFTER_DECLARED_FILTERS');
  assert.equal(o.noPicksDoesNotCertifyUpstreamSuccessfulZero,true);
  assert.equal(o.decisions.filter(d=>d.reason==='below_declared_score_floor').length,2);
});
test('opposite families on a market are both rejected rather than choosing an eventual winner',()=>{
  const o=build(s=>{for(const p of ['B','B2'])s.sources[p].plan.picks[0].pick='under';});
  assert.equal(o.count,0);assert.equal(o.decisions.filter(d=>d.reason==='conflicting_family_selections').length,2);
});
test('partial assessments remain explicit even when the selected match has a valid assessment',()=>{
  const o=build(s=>{s.sources.B.audit.evaluationAccounting.inputGapFixtures=38;});
  assert.equal(o.count,1);assert.equal(o.upstreamCoverage,'INCOMPLETE');assert.equal(o.coverageByPlan[2].inputGapFixtures,38);
});
test('a changed or missing declared universe is incomplete even when selected pairs agree',()=>{
  const o=build(s=>s.sources.A2.audit.fixtureUniverse.count=2);
  assert.equal(o.count,1);assert.equal(o.upstreamCoverage,'INCOMPLETE');assert.equal(o.universeCountAgreement,false);
});
test('unknown universe evidence stays unknown and absent forecast time is a missing input rather than ordinary rejection',()=>{
  const unknown=build(s=>{for(const source of Object.values(s.sources))delete source.audit.fixtureUniverse;});
  assert.equal(unknown.upstreamCoverage,'UNKNOWN');
  const missing=build(s=>{for(const source of Object.values(s.sources))source.plan.generatedAt='invalid';});
  assert.equal(missing.upstreamCoverage,'INCOMPLETE');assert.equal(missing.selectedSourceInputGaps,4);
  assert(missing.decisions.every(d=>d.reason==='required_forecast_time_or_kickoff_missing'));
});
test('an explicit empty canonical input is different from missing canonical files',()=>{
  const o=build(s=>{s.fixtures=[];for(const source of Object.values(s.sources)){source.plan.picks=[];source.plan.count=0;source.audit.fixtureUniverse.count=0;}});
  assert.equal(o.selectionStatus,'NO_CANONICAL_FIXTURES');
});
test('foundation blocks never masquerade as successful zero predictions',()=>{
  const o=build(s=>{for(const p of ['A','A2','B','B2'])s.sources[p].audit.modelInputLoadStatus={historyIndexFoundationGate:'stale'};});
  assert.equal(o.count,0);assert.equal(o.upstreamCoverage,'INCOMPLETE');
  assert.equal(o.decisions.filter(d=>d.reason==='reported_foundation_block').length,4);
});
test('categorical confidence is retained; categorical model probability is rejected',()=>{
  const o=build(s=>{s.sources.B.plan.picks[0].modelProb='high';});
  assert.equal(o.count,1);assert.deepEqual(o.picks[0].families,['statistical']);
  assert(o.decisions.some(d=>d.reason==='numeric_score_missing_or_invalid'));
});
test('real B/B2 payload shape without a producer timestamp uses observed bytes without inventing creation time',t=>{
  const s=sample();for(const plan of ['B','B2'])delete s.sources[plan].plan.generatedAt;
  const f=disk(t,s);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  const o=JSON.parse(fs.readFileSync(f.file));assert.equal(o.count,1);
  assert.deepEqual(o.picks[0].families,['statistical','assessment']);
  const b=o.baselineSelections.B[0];assert.equal(b.producerForecastAt,null);
  assert.equal(b.observedAt,now);assert.equal(b.forecastTimeBasis,'CAPTURED_SOURCE_BYTES');
  f.write(`final-results/${day}/${cid}.json`,finalTruth());
  assert.equal(refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:()=>({status:'NOT_COMMITTED'})}).metrics.U1.pending,1);
  assert.equal(refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven}).metrics.U1.wins,1);
});
test('earlier candidate artifacts remain separate and are never overwritten or mixed into revision 2',t=>{
  const f=disk(t);const old=f.write(`value-plans/${day}/unified-u1.json`,{oldCandidate:'preserve_exactly'});
  const before=fs.readFileSync(old);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  assert.deepEqual(fs.readFileSync(old),before);assert.notEqual(old,f.file);
  assert.equal(JSON.parse(fs.readFileSync(f.file)).candidateId,'unified-u1-r2');
});
test('a numeric zero score is below the floor, not missing data, and a score of one stays valid',()=>{
  const zero=build(s=>{for(const source of Object.values(s.sources)){source.plan.picks[0].score=0;source.plan.picks[0].modelProb=0;}});
  assert.equal(zero.count,0);assert(zero.decisions.every(d=>d.reason==='below_declared_score_floor'));
  const one=build(s=>{for(const source of Object.values(s.sources)){source.plan.picks[0].score=1;source.plan.picks[0].modelProb=1;}});
  assert.equal(one.count,1);
});
test('duplicates are not resolved by taking the higher score',()=>{
  const o=build(s=>{const p=clone(s.sources.A.plan.picks[0]);p.score=.99;s.sources.A.plan.picks.push(p);s.sources.A.plan.count=2;});
  assert.equal(o.baselineSelections.A.length,0);assert.equal(o.decisions.filter(d=>d.reason==='duplicate_source_selection').length,2);
});
test('unknown identity, ambiguous canonical rows, unsupported markets and nonfuture games are explicit rejections',()=>{
  for(const alter of [s=>s.fixtures=[],s=>s.fixtures.push(clone(s.fixtures[0])),
    s=>s.fixtures[0].status='LIVE',s=>s.now=kickoff,
    s=>{for(const p of Object.values(s.sources))p.plan.picks[0].market='OU225';}]){
    assert.equal(build(alter).count,0);
  }
});
test('missing kickoff, different pick kickoff, future-dated source and invalid declared source time cannot enter the sample',()=>{
  for(const alter of [s=>delete s.fixtures[0].kickoffUtc,
    s=>{for(const p of Object.values(s.sources))p.plan.picks[0].kickoffUtc='2099-12-30T16:00:00Z';},
    s=>{for(const p of Object.values(s.sources))p.plan.generatedAt='2099-12-30T08:00:00Z';},
    s=>{for(const p of Object.values(s.sources))p.plan.generatedAt='invalid';}])assert.equal(build(alter).count,0);
});
test('invalid source count or missing audit throws instead of manufacturing zero picks',()=>{
  assert.throws(()=>build(s=>s.sources.A.plan.count=0),/unified_invalid_source_A/);
  assert.throws(()=>build(s=>delete s.sources.B.audit),/unified_missing_source_B/);
});
test('unsupported and historic target days cannot be used to backfill a prospective observation',()=>{
  assert.throws(()=>buildUnifiedShadow({...sample(),day:'2026-08-19'}),/outside_prospective/);
  assert.throws(()=>buildUnifiedShadow({...sample(),day:'2099-02-30'}),/invalid_day/);
  assert.throws(()=>buildUnifiedShadow({...sample(),day:'2099-12-31',now:'2099-12-28T07:00:00Z'}),/outside_prospective/);
});
test('capture stores exact source bytes, first capture stays immutable when forecasts change, and corruption blocks',t=>{
  const f=disk(t),options={dataRoot:f.dataRoot,now,checkpoint:noop};
  const before=fs.readFileSync(path.join(f.dataRoot,'value-plans',day,'plan-a.json'));
  assert.equal(captureUnifiedShadow(day,options).status,'CAPTURED');
  const original=fs.readFileSync(f.file);const o=validateUnifiedShadow(JSON.parse(original));
  const source=o.inputFiles.find(x=>x.path.endsWith('/plan-a.json'));
  assert.equal(source.rawUtf8,before.toString('utf8'));
  f.write(`value-plans/${day}/plan-a.json`,{broken:true});
  assert.equal(captureUnifiedShadow(day,options).status,'FROZEN_OBSERVATION_PRESERVED');assert.deepEqual(fs.readFileSync(f.file),original);
  const bad=JSON.parse(original);bad.count=200;fs.writeFileSync(f.file,JSON.stringify(bad));
  assert.throws(()=>captureUnifiedShadow(day,options),/existing_observation_invalid/);
});
test('missing files create an incident and never freeze a zero-selection day',t=>{
  const f=disk(t);fs.unlinkSync(path.join(f.dataRoot,'value-plans',day,'plan-b.json'));
  assert.throws(()=>runUnifiedShadowDay(day,{dataRoot:f.dataRoot,now,checkpoint:noop}),/capture_failed_evidence_retained/);
  assert.equal(fs.existsSync(f.file),false);
  const incidents=fs.readdirSync(path.join(f.dataRoot,'value-plans',day,`${unifiedSpec.candidateId}-incidents`));
  assert.equal(incidents.length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.dataRoot,'value-plans',day,`${unifiedSpec.candidateId}-incidents`,incidents[0]))).status,'CAPTURE_FAILED_NOT_A_ZERO_PICK_RESULT');
});
test('missing canonical files are not interpreted as no matches',t=>{
  const f=disk(t);fs.unlinkSync(path.join(f.dataRoot,'canonical-fixtures',day,'test.1.json'));
  assert.throws(()=>captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop}),/canonical_input_files_missing/);
});
test('credential fields stop capture without creating a forecast or printing the value',t=>{
  const f=disk(t);const source=sample().sources.A.plan;source.apiKey='test-private-placeholder';
  f.write(`value-plans/${day}/plan-a.json`,source);
  assert.throws(()=>captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop}),/unified_credential_field_in_source/);
  assert.equal(fs.existsSync(f.file),false);
});
test('durability proof is required; exact final truth settles the preserved original pick',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});f.write(`final-results/${day}/${cid}.json`,finalTruth());
  const after='2099-12-30T19:00:00Z';
  let r=refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:after,proof:()=>({status:'NOT_COMMITTED'})});
  assert.equal(r.metrics.U1.settledMarkets,0);assert.equal(r.metrics.U1.pending,1);
  r=refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:after,proof:proven});
  assert.equal(r.metrics.U1.wins,1);assert.equal(r.metrics.A.wins,1);assert.equal(r.metrics.B.wins,1);
});
test('wrong-day or different-kickoff final truth does not settle by team names',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  const truth=finalTruth();truth.kickoffUtc='2099-12-29T15:00:00Z';f.write(`final-results/${day}/${cid}.json`,truth);
  assert.equal(refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven}).metrics.U1.pending,1);
  truth.date='2099-12-29';truth.kickoffUtc=kickoff;f.write(`final-results/${day}/${cid}.json`,truth);
  assert.equal(refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven}).metrics.U1.pending,1);
});
test('settled outcomes stay unchanged and changed verified scores become a conflict',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  f.write(`final-results/${day}/${cid}.json`,finalTruth());
  const opts={dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven};
  refreshUnifiedShadowResults(day,opts);
  const truth=finalTruth();truth.finalScore={homeScore:0,awayScore:0,scoreKey:'0-0'};f.write(`final-results/${day}/${cid}.json`,truth);
  const r=refreshUnifiedShadowResults(day,{...opts,now:'2099-12-30T20:00:00Z'});
  assert.equal(r.metrics.U1.wins,1);assert.equal(r.conflictCount,5);
});
test('duplicate final files, missing verified verdict and late durability remain pending',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  const truth=finalTruth(),file=f.write(`final-results/${day}/${cid}.json`,truth);
  f.write(`final-results/${day}/duplicate.json`,truth);
  const opts={dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven};
  assert.equal(refreshUnifiedShadowResults(day,opts).metrics.U1.pending,1);
  fs.unlinkSync(path.join(f.dataRoot,'final-results',day,'duplicate.json'));
  const late=()=>({...proven(),committedAt:'2099-12-30T16:00:00Z'});
  assert.equal(refreshUnifiedShadowResults(day,{...opts,proof:late}).metrics.U1.pending,1);
  truth.verifiedFinalTruth=false;fs.writeFileSync(file,JSON.stringify(truth));
  assert.equal(refreshUnifiedShadowResults(day,opts).metrics.U1.pending,1);
});
test('Under, BTTS No and draw retain their declared selection during settlement',t=>{
  for(const [market,a,b] of [['OU25','Under 2.5','under'],['BTTS','BTTS NO','no'],['1X2','DRAW','draw']]) {
    const s=sample();for(const [plan,source] of Object.entries(s.sources)){source.plan.picks[0].market=market;source.plan.picks[0].pick=plan.startsWith('A')?a:b;}
    const f=disk(t,s);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});f.write(`final-results/${day}/${cid}.json`,finalTruth());
    const result=refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z',proof:proven});
    assert.equal(result.metrics.U1.settledMarkets,1);assert.equal(result.metrics.U1.wins,0);
  }
});
test('corrupt existing result reports cause a durable incident rather than a replacement',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  f.write(`value-plans/${day}/${unifiedSpec.candidateId}-results.json`,{schema:'broken'});
  assert.throws(()=>runUnifiedShadowDay(day,{dataRoot:f.dataRoot,now,checkpoint:noop}),/unified_settlement_failed_evidence_retained/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dataRoot,'value-plans',day,`${unifiedSpec.candidateId}-results.json`))),{schema:'broken'});
});
test('both normal workflows capture shadow before their existing staged publication without blocking the plans',()=>{
  for(const name of ['daily-deploy-snapshot.yml','intraday-deploy-snapshot-refresh.yml']) {
    const text=fs.readFileSync(new URL(`../../.github/workflows/${name}`,import.meta.url),'utf8');
    const shadow=text.indexOf('- name: Capture and settle unified candidate in shadow'),stage=text.indexOf('- name: Stage allowed');
    assert(shadow>0&&shadow<stage);assert.match(text.slice(shadow,stage),/continue-on-error: true/u);
    assert.match(text.slice(shadow,stage),/capture-unified-shadow-day\.js --date="\$DAY_KEY"/u);
  }
});
test('real Git publication proof rejects altered observation bytes after the first commit',t=>{
  const f=disk(t);captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  const git=initGit(f.root);f.write(`final-results/${day}/${cid}.json`,finalTruth());
  assert.equal(refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T19:00:00Z'}).metrics.U1.wins,1);
  const o=JSON.parse(fs.readFileSync(f.file));o.generatedAt='2099-12-30T07:01:00Z';
  const {observationSignature,...body}=o;o.observationSignature=signature(body);fs.writeFileSync(f.file,JSON.stringify(o,null,2)+'\n');
  git(['add',f.file]);git(['commit','-m','simulate changed forecast']);
  assert.throws(()=>refreshUnifiedShadowResults(day,{dataRoot:f.dataRoot,now:'2099-12-30T20:00:00Z'}),/previous_result_row_disappeared/);
});
test('original candidate, all inputs, and partial-data accounting survive an independent archive restore',t=>{
  const s=sample();s.sources.B.audit.evaluationAccounting.inputGapFixtures=38;
  const f=disk(t,s),git=initGit(f.root),remote=path.join(f.root,'archive.git');
  git(['init','--bare',remote]);git(['remote','add','origin',remote]);
  captureUnifiedShadow(day,{dataRoot:f.dataRoot,now,checkpoint:noop});
  const original=fs.readFileSync(f.file),saved=preserveHistoryCheckpoint({root:f.root,dayKey:day,stage:'unified',runId:'test'});
  const dest=path.join(f.root,'independent-restored');restoreHistoryCheckpoint({root:f.root,ref:saved.archiveCommit,manifestPath:saved.manifestPath,destination:dest});
  const restored=fs.readFileSync(path.join(dest,'data','value-plans',day,`${unifiedSpec.candidateId}.json`));
  assert.deepEqual(restored,original);assert.equal(validateUnifiedShadow(JSON.parse(restored)).upstreamCoverage,'INCOMPLETE');
  assert.equal(unifiedSpec.minimumEachVariantScore,.75);assert.match(specSha256,/^[a-f0-9]{64}$/u);
});
