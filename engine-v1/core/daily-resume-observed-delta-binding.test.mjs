import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {observeStage20Pre,observeStage20Post,observeStage20FailedCycle} from '../jobs/observe-stage20-data-inventory.mjs';
import {bindObservedStage20Delta,publicStage20DenialReason} from '../jobs/bind-observed-stage20-delta.mjs';
const day='2026-11-24';
function fixture(fn){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-bound-delta-')),root=path.join(tmp,'repo'),temp=path.join(tmp,'evidence');
 fs.mkdirSync(root);fs.mkdirSync(temp);fs.mkdirSync(path.join(root,'data/value'),{recursive:true});
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const value=path.join(root,'data/value/'+day+'.json');
 try{
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(value,'{"a":1}');git('add','.');git('commit','-qm','baseline');
  observeStage20Pre(root,day,temp);fs.writeFileSync(value,'{"a":2}');
  fn({root,temp,value,git});
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
const target=x=>path.join(x.temp,'aiml-stage20-bound-delta');
const post=x=>observeStage20Post(x.root,day,x.temp);
const bind=x=>bindObservedStage20Delta(x.root,x.temp,day);
test('observed real filesystem pre/post binds exact payload, never grants completion or resume',()=>fixture(x=>{
 post(x);const before=x.git('status','--porcelain');const r=bind(x);
 assert.equal(r.entries,1);assert.equal(r.cycleSuccessVerified,false);assert.equal(r.resumeAuthorized,false);assert.equal(r.publicationAuthorized,false);
 assert.equal(fs.readFileSync(path.join(target(x),'files/data/value/'+day+'.json'),'utf8'),'{"a":2}');
 assert.equal(x.git('status','--porcelain'),before);
 assert.throws(()=>bind(x),/bound_delta_exists/);
}));
test('missing successful post rejects',()=>fixture(x=>{assert.throws(()=>bind(x));assert.ok(!fs.existsSync(target(x)));}));
test('failed cycle observation rejects',()=>fixture(x=>{observeStage20FailedCycle(x.root,day,x.temp);assert.throws(()=>bind(x),/failed_cycle_evidence_conflict/);assert.ok(!fs.existsSync(target(x)));}));
test('tampered observed delta rejects',()=>fixture(x=>{post(x);const p=path.join(x.temp,'aiml-stage20-delta.json');const d=JSON.parse(fs.readFileSync(p));d.modified=0;fs.writeFileSync(p,JSON.stringify(d));assert.throws(()=>bind(x),/observed_delta_mismatch/);assert.ok(!fs.existsSync(target(x)));}));
test('late source drift rejects and leaves no archive',()=>fixture(x=>{post(x);fs.writeFileSync(x.value,'{"a":3}');assert.throws(()=>bind(x),/source_drift/);assert.ok(!fs.existsSync(target(x)));}));
test('wrong date rejects',()=>fixture(x=>{post(x);assert.throws(()=>bindObservedStage20Delta(x.root,x.temp,'2026-11-23'));assert.ok(!fs.existsSync(target(x)));}));
test('symlink evidence rejects',()=>fixture(x=>{post(x);const p=path.join(x.temp,'aiml-stage20-delta.json');fs.renameSync(p,p+'.real');fs.symlinkSync(p+'.real',p);assert.throws(()=>bind(x),/invalid_observation_file/);assert.ok(!fs.existsSync(target(x)));}));

test('reports fixed denial categories without leaking paths or arbitrary messages',()=>{
  assert.equal(publicStage20DenialReason(Error('stage20_prepost_delta_too_large')),'DELTA_BYTE_LIMIT');
  assert.equal(publicStage20DenialReason(Error('stage20_prepost_paths_not_admitted')),'PATH_POLICY_DENIED');
  assert.equal(publicStage20DenialReason(Error('stage20_prepost_final_tree_drift')),'POST_INVENTORY_TREE_CHANGED');
  assert.equal(publicStage20DenialReason(Error('read failed at /private/data')),'UNKNOWN');
});
