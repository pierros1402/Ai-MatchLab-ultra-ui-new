import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {refreshIntradayCoverageReadiness,verifyIntradayRuntimeRelease} from './prepare-intraday-runtime-release.js';
const day='2026-11-28';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-runtime-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const write=(kind,value)=>{fs.mkdirSync(path.join(root,kind),{recursive:true});fs.writeFileSync(path.join(root,kind,day+'.json'),JSON.stringify(value));};
  const coverage={dayKey:day,generatedAt:'2026-11-28T00:00:00Z',activeCompetitionCompleteness:{schema:'ai-matchlab.active-competition-completeness.v1',proven:false}};
  write('value-comparison',{ok:true,date:day,plans:{A:{},A2:{},B:{},B2:{}}});
  write('build-reports',{dayKey:day});write('system-health',{dayKey:day});write('coverage-readiness',coverage);
  write('foundation-integrity',{dayKey:day,modelReady:false,publicationReady:false});
  return {root,write,coverage};
}
test('local closure uses the actual runtime contract and preserves honest incomplete coverage',async t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.root,'coverage-readiness',day+'.json'));
  assert.equal((await verifyIntradayRuntimeRelease(day,{dataRoot:f.root})).ok,true);
  assert.deepEqual(fs.readFileSync(path.join(f.root,'coverage-readiness',day+'.json')),before);
});
for(const kind of ['coverage-readiness','value-comparison','build-reports','system-health','foundation-integrity']){
  test(`release missing ${kind} fails before publication`,async t=>{
    const f=fixture(t);fs.unlinkSync(path.join(f.root,kind,day+'.json'));
    await assert.rejects(verifyIntradayRuntimeRelease(day,{dataRoot:f.root}),/required_for_current_release/);
  });
}
test('coverage refresh is byte-stable for clock-only changes but retains real evidence changes',t=>{
  const f=fixture(t),file=path.join(f.root,'coverage-readiness',day+'.json'),before=fs.readFileSync(file);
  let candidate={...f.coverage,generatedAt:'2026-11-28T01:00:00Z'};
  const buildCoverage=()=>f.write('coverage-readiness',candidate);
  assert.equal(refreshIntradayCoverageReadiness(day,{dataRoot:f.root,buildCoverage}).changed,false);
  assert.deepEqual(fs.readFileSync(file),before);
  candidate={...candidate,activeCompetitionCompleteness:{...candidate.activeCompetitionCompleteness,blockingIssues:[{slug:'missing',reason:'unverified'}]}};
  assert.equal(refreshIntradayCoverageReadiness(day,{dataRoot:f.root,buildCoverage}).changed,true);
  assert.equal(JSON.parse(fs.readFileSync(file)).activeCompetitionCompleteness.proven,false);
});
test('cross-day, malformed and contractless coverage never passes local closure',async t=>{
  const f=fixture(t);
  f.write('coverage-readiness',{...f.coverage,dayKey:'2026-11-27'});
  await assert.rejects(verifyIntradayRuntimeRelease(day,{dataRoot:f.root}),/runtime_coverage_day_mismatch/);
  f.write('coverage-readiness',{dayKey:day});
  await assert.rejects(verifyIntradayRuntimeRelease(day,{dataRoot:f.root}),/runtime_coverage_contract_invalid/);
  fs.writeFileSync(path.join(f.root,'coverage-readiness',day+'.json'),'{broken');
  await assert.rejects(verifyIntradayRuntimeRelease(day,{dataRoot:f.root}));
});
test('actual shell-expanded staging boundaries admit only the selected coverage day',t=>{
  const source=fs.readFileSync(new URL('../../.github/workflows/intraday-deploy-snapshot-refresh.yml',import.meta.url),'utf8');
  const patterns=[source.match(/--label=intraday-public-truth-checkpoint[^\n]*--allow="([^"]+)"/)[1],source.split('--label=intraday-deploy-snapshot-refresh')[1].match(/--allow="([^"]+)"/)[1]];
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  for(const pattern of patterns){
    const expanded=spawnSync(bash,['-c',`printf '%s' "${pattern}"`],{env:{...process.env,DAY_KEY:day},encoding:'utf8',windowsHide:true});
    if(expanded.error?.code==='ENOENT'){t.skip('Bash unavailable');return;}
    assert.equal(expanded.status,0,expanded.stderr);
    const allow=new RegExp(expanded.stdout);
    assert.equal(allow.test(`data/coverage-readiness/${day}.json`),true,expanded.stdout);
    assert.equal(allow.test('data/coverage-readiness/2026-11-27.json'),false);
    assert.equal(allow.test(`data/coverage-readiness/${day}xjson`),false);
    assert.equal(allow.test('data/history/2026-2027.json'),false);
  }
});
