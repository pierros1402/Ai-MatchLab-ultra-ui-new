import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginPublication, publicationReadLeaseDir } from './runtime-publication-guard.js';
import { inspectPublicationRecovery } from './runtime-publication-recovery.js';
async function sandbox(fn) { const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35h-')); try{await fn(root)}finally{await fs.rm(root,{recursive:true,force:true})} }
async function write(root,p,x){const file=path.join(root,p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,typeof x==='string'?x:JSON.stringify(x));}
const args={day:'2026-11-11',ref:'a'.repeat(40),manifestHash:'b'.repeat(64),mode:'snapshot'};
test('no marker is observed without granting recovery',()=>sandbox(async root=>{
 const x=inspectPublicationRecovery(root);assert.equal(x.decision,'NO_MARKER_OBSERVED');assert.equal(x.autoClearAuthorized,false);
}));
test('malformed marker stays HOLD',()=>sandbox(async root=>{
 await write(root,'.snapshot-sync/publication-guard.json','{');const x=inspectPublicationRecovery(root);assert.equal(x.decision,'HOLD');assert.deepEqual(x.reasons,['publication_marker_untrusted']);
}));
test('marker without manifest or witness is HOLD',()=>sandbox(async root=>{
 await beginPublication(root,args);const x=inspectPublicationRecovery(root);assert.equal(x.decision,'HOLD');assert.ok(x.reasons.includes('manifest_missing_or_mismatch'));assert.ok(x.reasons.includes('sync_witness_missing_or_mismatch'));
}));
test('matching metadata is not proof of completed full publication',()=>sandbox(async root=>{
 await beginPublication(root,args);await write(root,'deploy-snapshots/2026-11-11/manifest.json',{hash:args.manifestHash});await write(root,'deploy-snapshots/runtime-sync-state.json',{days:{'2026-11-11':{manifestHash:args.manifestHash,ref:args.ref}}});
 const x=inspectPublicationRecovery(root);assert.equal(x.decision,'HOLD');assert.ok(x.reasons.includes('metadata_coherent_but_full_publication_not_proven'));
}));
test('wrong ref in witness stays HOLD',()=>sandbox(async root=>{
 await beginPublication(root,args);await write(root,'deploy-snapshots/2026-11-11/manifest.json',{hash:args.manifestHash});await write(root,'deploy-snapshots/runtime-sync-state.json',{days:{'2026-11-11':{manifestHash:args.manifestHash,ref:'c'.repeat(40)}}});
 assert.ok(inspectPublicationRecovery(root).reasons.includes('sync_witness_missing_or_mismatch'));
}));
test('orphan lease prevents clean classification',()=>sandbox(async root=>{
 await fs.mkdir(publicationReadLeaseDir(root),{recursive:true});await write(root,'.snapshot-sync/publication-read-leases/orphan.lease','101');assert.equal(inspectPublicationRecovery(root).decision,'HOLD');
}));
test('settlement partial mirrors remain HOLD',()=>sandbox(async root=>{
 await beginPublication(root,{...args,mode:'settlement'});await write(root,'value-comparison/2026-11-11.json',{count:2});const x=inspectPublicationRecovery(root);assert.equal(x.decision,'HOLD');assert.equal(x.artifacts.embedded,'missing');assert.equal(x.artifacts.mirror,'present');
}));
test('recovery audit makes zero source mutations',()=>sandbox(async root=>{
 await beginPublication(root,args);const p=path.join(root,'.snapshot-sync/publication-guard.json');const a=await fs.readFile(p);inspectPublicationRecovery(root);const b=await fs.readFile(p);assert.deepEqual(a,b);
}));

test('shadow marker is recognized but remains HOLD',()=>sandbox(async root=>{
  const day='2026-11-11',ref='a'.repeat(40);
  await beginPublication(root,{day,ref,mode:'plan-c-shadow'});
  const result=inspectPublicationRecovery(root);
  assert.equal(result.decision,'HOLD');
  assert.equal(result.autoClearAuthorized,false);
  assert.equal(result.mode,'plan-c-shadow');
  assert.ok(result.reasons.includes('shadow_full_publication_not_proven'));
  assert.ok(!result.reasons.includes('publication_marker_untrusted'));
}));

test('matching shadow files remain HOLD without cleanup',()=>sandbox(async root=>{
  const crypto=await import('node:crypto');
  const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
  const day='2026-11-11',ref='a'.repeat(40);
  const payload=JSON.stringify({date:day,mode:'SHADOW'});
  const audit=JSON.stringify({
    schema:'ai-matchlab.plan-c-shadow-build-audit.v1',
    ok:true,date:day,productionEligible:false,
    outputSha256:sha(payload),count:0,pickCount:0
  });
  const release={
    schema:'ai-matchlab.plan-c-shadow-runtime-release.v1',
    ok:true,mode:'SHADOW',productionEligible:false,
    date:day,ref,payloadSha256:sha(payload),
    auditSha256:sha(audit),count:0,pickCount:0
  };
  await beginPublication(root,{day,ref,mode:'plan-c-shadow'});
  const base='runtime-releases/plan-c-shadow/'+day+'/';
  await write(root,base+'plan-c-shadow.json',payload);
  await write(root,base+'plan-c-shadow-audit.json',audit);
  await write(root,base+'release.json',release);
  const result=inspectPublicationRecovery(root);
  assert.equal(result.decision,'HOLD');
  assert.equal(result.autoClearAuthorized,false);
  assert.equal(result.artifacts.releaseBindingMatches,true);
  assert.equal(result.artifacts.auditBindingMatches,true);
}));

test('shadow backup evidence is reported and retained',()=>sandbox(async root=>{
  const day='2026-11-11',ref='a'.repeat(40);
  await beginPublication(root,{day,ref,mode:'plan-c-shadow'});
  const p='runtime-releases/plan-c-shadow/.backup-'+day+'-test/old.txt';
  await write(root,p,'OLD');
  const result=inspectPublicationRecovery(root);
  assert.equal(result.decision,'HOLD');
  assert.ok(result.reasons.includes('shadow_backup_evidence_present'));
  const fs=await import('node:fs/promises');
  const path=await import('node:path');
  assert.equal(await fs.readFile(path.join(root,p),'utf8'),'OLD');
}));
