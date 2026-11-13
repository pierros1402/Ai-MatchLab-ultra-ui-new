import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { qualifyGenerationReadiness as qualify } from './runtime-generation-readiness.js';
const latest={date:'2026-11-12',hash:'a'.repeat(64)};
test('legacy remains available only without strict mode',async()=>{
  const reader=async()=>({mode:'LEGACY'});
  assert.deepEqual((await qualify({dataRoot:'/tmp',latest,strict:false,reader})).mode,'LEGACY');
  assert.equal((await qualify({dataRoot:'/tmp',latest,strict:true,reader})).ok,false);
});
test('pinned generation is exposed without mutating its source',async()=>{
  const got=await qualify({dataRoot:'/tmp',latest,strict:true,reader:async()=>({mode:'PINNED',ref:'f'.repeat(40),generation:'a'.repeat(32)})});
  assert.equal(got.ok,true);assert.equal(got.day,latest.date);assert.equal(got.mode,'PINNED');
});
test('corrupt pointer is HOLD even without strict',async()=>{
  const got=await qualify({dataRoot:'/tmp',latest,strict:false,reader:async()=>{throw Error('invalid_pointer')}});
  assert.equal(got.ok,false);assert.match(got.reason,/invalid_pointer/);
});
test('unknown mode is fail-closed',async()=>{
  assert.equal((await qualify({dataRoot:'/tmp',latest,strict:false,reader:async()=>({mode:'UNKNOWN'})})).ok,false);
});
test('missing latest is HOLD in strict mode',async()=>{
  assert.equal((await qualify({dataRoot:'/tmp',latest:null,strict:true,reader:async()=>({mode:'PINNED'})})).ok,false);
});
test('real Engine readiness and release share the same fail-closed qualification',()=>{
 const index=fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../index.js'),'utf8');
 for (const route of ['app.get("/release", async','app.get("/ready", async']) assert.ok(index.includes(route));
 assert.equal((index.match(/const generationReadiness = await qualifyGenerationReadiness\(/g)||[]).length,2);
 assert.match(index,/latestMatches &&\s*generationReadiness.ok/);
 assert.match(index,/generation_readiness_hold/);
});
