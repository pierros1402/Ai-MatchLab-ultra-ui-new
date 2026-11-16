import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {atomicArtifact} from './evidence-bound-history-store.js';
test('existing immutable journal facts require exact byte equality and never change',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-journal-reuse-')),file=path.join(dir,'fact.json');
 try{
  fs.writeFileSync(file,'original\n');const before=fs.statSync(file).mtimeMs;
  await atomicArtifact(file,'original\n',{immutable:true});assert.equal(fs.statSync(file).mtimeMs,before);
  await assert.rejects(atomicArtifact(file,'changed\n',{immutable:true}),{code:'EEXIST'});
  assert.equal(fs.readFileSync(file,'utf8'),'original\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
