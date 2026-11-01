import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {finalizeProspectiveRelease} from './finalize-prospective-release.mjs';

test('changed current release retains all gates, reconstructs missing derived source, and rolls back failed promotion',()=>{
 const cwd=fs.mkdtempSync(path.join(tmpdir(),'prospective-release-'));
 const day='2026-11-01',today=day,root=path.join(cwd,'data/deploy-snapshots');
 const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value));};
 const latest=path.join(root,'latest.json');
 write(latest,{date:day,hash:'old'});write(path.join(root,day,'manifest.json'),{date:day,hash:'new'});
 write(path.join(root,day,'fixtures.json'),{fixtures:[{canonicalId:'cid_test'}]});
 const before=fs.readFileSync(latest),calls=[];
 const run=(script,args)=>{calls.push({script,args});if(script.endsWith('/promote-deploy-snapshot-latest-day.js'))write(latest,{date:day,hash:'new'});};
 try{
  assert.equal(finalizeProspectiveRelease(day,{cwd,today,run}).snapshotSyncRequired,true);
  assert.equal(calls[0].script,'engine-v1/jobs/build-details-day.js');
  const pre=calls.findIndex(x=>x.script.endsWith('/verify-daily-publish-contract.js')&&x.args.includes('--prepublish'));
  const promote=calls.findIndex(x=>x.script.endsWith('/promote-deploy-snapshot-latest-day.js'));
  assert.ok(pre>=0&&promote>pre);
  assert.ok(calls.some(x=>x.script.endsWith('/verify-artifact-freshness-day.js')&&x.args.includes('--gate')));
  assert.ok(calls.at(-1).script.endsWith('/verify-daily-publish-contract.js'));
  calls.length=0;
  assert.equal(finalizeProspectiveRelease(day,{cwd,today,run}).snapshotSyncRequired,false);assert.equal(calls.length,0);
  fs.writeFileSync(latest,before);
  assert.throws(()=>finalizeProspectiveRelease(day,{cwd,today,run:(s,a)=>{if(s.endsWith('/verify-artifact-freshness-day.js'))throw Error('stale');run(s,a);}}),/stale/);
  assert.deepEqual(fs.readFileSync(latest),before);
  assert.throws(()=>finalizeProspectiveRelease(day,{cwd,today,run:(s,a)=>{run(s,a);if(s.endsWith('/verify-daily-publish-contract.js')&&!a.includes('--prepublish'))throw Error('final_gate_failed');}}),/final_gate_failed/);
  assert.deepEqual(fs.readFileSync(latest),before);
  calls.length=0;
  assert.equal(finalizeProspectiveRelease('2026-11-02',{cwd,today,run}).snapshotSyncRequired,false);
  assert.equal(calls.length,0);
  write(latest,{date:'2026-11-02',hash:'future'});
  assert.equal(finalizeProspectiveRelease(day,{cwd,today,run}).snapshotSyncRequired,false);
  assert.equal(calls.length,0);
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
