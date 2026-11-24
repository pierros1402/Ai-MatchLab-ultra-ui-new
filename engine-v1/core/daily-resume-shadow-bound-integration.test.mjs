import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {observeStage20Pre,observeStage20Post} from '../jobs/observe-stage20-data-inventory.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const workflow=fs.readFileSync(path.join(root,'.github/workflows/daily-deploy-snapshot.yml'),'utf8');
function step(id){
 const text=workflow.split('\n');
 const i=text.findIndex(l=>l.trim()==='id: '+id);
 assert.ok(i>=0);
 let end=i+1;
 while(end<text.length && !/^      - name:/.test(text[end]))end++;
 return text.slice(i,end).join('\n');
}
test('capture requires successful actual cycle and both observers plus both opt-ins',()=>{
 const s=step('shadow_capture_stage20');
 const guard=s.split('\n').find(l=>l.trim().startsWith('if:'));
 for(const clause of ["env.SKIP_BUILD != 'true'","vars.AIML_DAILY_STAGE20_CAPTURE_ENABLED == '1'","vars.AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED == '1'","steps.daily_cycle.outcome == 'success'","steps.shadow_stage20_pre.outcome == 'success'","steps.shadow_stage20_post.outcome == 'success'"])assert.ok(guard.includes(clause),clause);
 assert.ok(!guard.includes('||'));assert.match(s,/continue-on-error: true/);
 assert.match(s,/node engine-v1\/jobs\/bind-observed-stage20-delta\.mjs "\$DAY_KEY"/);
});
test('upload uses bound archive only, no raw inventories or publication authority',()=>{
 const start=workflow.indexOf('      - name: Preserve successful stage-20 delta');
 const end=workflow.indexOf('      # Minimal sanitized runtime markers',start);
 const s=workflow.slice(start,end);
 assert.match(s,/steps\.shadow_capture_stage20\.outcome == 'success'/);
 assert.match(s,/aiml-stage20-bound-delta\//);
 assert.doesNotMatch(s,/aiml-stage20-(?:pre|post|capture)\b/);
 assert.match(s,/continue-on-error: true/);
 assert.match(s,/retention-days: 2/);
});
test('actual CLI succeeds only on exact observed filesystem delta',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-shadow-cli-'));
 const repo=path.join(tmp,'repo'),temp=path.join(tmp,'evidence'),day='2026-11-24';
 try{
  fs.mkdirSync(path.join(repo,'data/value'),{recursive:true});fs.mkdirSync(temp);
  const p=path.join(repo,'data/value',day+'.json');
  const git=(...args)=>execFileSync('git',args,{cwd:repo});
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(p,'{"x":1}');git('add','.');git('commit','-qm','baseline');
  const run=()=>spawnSync(process.execPath,[path.join(root,'engine-v1/jobs/bind-observed-stage20-delta.mjs'),day],{cwd:repo,env:{...process.env,RUNNER_TEMP:temp},encoding:'utf8'});
  assert.equal(run().status,1);
  observeStage20Pre(repo,day,temp);fs.writeFileSync(p,'{"x":2}');observeStage20Post(repo,day,temp);
  const result=run();assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout.trim().split('STAGE20_BOUND_DELTA=')[1]);
  assert.equal(receipt.resumeAuthorized,false);assert.equal(receipt.publicationAuthorized,false);assert.equal(receipt.cycleSuccessVerified,false);
  assert.equal(run().status,1);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
