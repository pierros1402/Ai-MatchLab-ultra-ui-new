import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyReviewedOperations} from './apply-reviewed-uefa-ledger.js';
import {sha256} from '../core/reviewed-uefa-ledger-recovery.js';
test('reviewed transaction rolls back byte-exact originals and removes partial creations on write failure',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-reviewed-transaction-'));
 try{
  const a='data/canonical-fixtures/2024-09-05/uefa.nations.json',b='data/final-results/2024-09-05/cid_test.json';
  fs.mkdirSync(path.dirname(path.join(root,a)),{recursive:true});const before=Buffer.from('{"preserved":true}\r\n');fs.writeFileSync(path.join(root,a),before);
  let calls=0;
  assert.throws(()=>applyReviewedOperations([{relative:a,beforeSha256:sha256(before),payload:{new:true}},{relative:b,beforeSha256:null,payload:{new:true}}],{root,backupDir:path.join(root,'backups'),writeFn:(target,payload)=>{
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(payload,null,2)+'\n');if(++calls===2)throw Error('SIMULATED_DISK_FAILURE');
  }}),/SIMULATED_DISK_FAILURE/);
  assert.deepEqual(fs.readFileSync(path.join(root,a)),before);assert.equal(fs.existsSync(path.join(root,b)),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('scope escape and input drift reject before any write',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-reviewed-drift-'));
 try{
  let called=false;const options={root,backupDir:path.join(root,'backup'),writeFn:()=>{called=true;}};
  assert.throws(()=>applyReviewedOperations([{relative:'data/value/frozen.json',beforeSha256:null,payload:{}}],options),/OUT_OF_SCOPE/);
  assert.throws(()=>applyReviewedOperations([{relative:'data/history/2024-2025.json',beforeSha256:'f'.repeat(64),payload:{}}],options),/INPUT_DRIFT/);
  assert.equal(called,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
