import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareImmutableGeneration,activateImmutableGeneration,readPinnedImmutableGeneration,verifyImmutableGeneration } from './runtime-immutable-generation.js';
import { prepareSettlementRevision,activateSettlementRevision } from './runtime-settlement-generation.js';
const day='2026-11-12',ref='a'.repeat(40),settlementRef='c'.repeat(40),hash='b'.repeat(64);
async function env(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35l-'));
 const stage=path.join(root,'source');
 await fs.mkdir(path.join(stage,'runtime'),{recursive:true});
 await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({hash,dayKey:day}));
 await fs.writeFile(path.join(stage,'runtime','value-comparison.json'),Buffer.from('{"date":"2026-11-12","status":"OLD"}'));
 try{await fn({root,stage});}finally{await fs.rm(root,{force:true,recursive:true});}
}
async function initial(root,stage){const g=await prepareImmutableGeneration({dataRoot:root,day,ref,manifestHash:hash,sourceDir:stage});await activateImmutableGeneration(root,g);return g;}
const comparison=Buffer.from('{"date":"2026-11-12","status":"WIN"}');
const prepare=(root,extra={})=>prepareSettlementRevision({dataRoot:root,day,settlementRef,comparisonBytes:comparison,...extra});
test('legacy day with no pointer remains legacy, never auto-activates',()=>env(async({root})=>{
 assert.equal(await prepare(root),null);
}));
test('verified settlement revision preserves snapshot ref, day and manifest',()=>env(async({root,stage})=>{
 const old=await initial(root,stage),next=await prepare(root);
 assert.notEqual(old.generation,next.generation);
 assert.equal(next.ref,ref);assert.equal(next.manifestHash,hash);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,old.generation);
 assert.equal((await fs.readFile(path.join(next.directory,'runtime','value-comparison.json'))).toString(),comparison.toString());
 const provenance=JSON.parse(await fs.readFile(path.join(next.directory,'runtime','settlement-source.json'),'utf8'));
 assert.equal(provenance.settlementRef,settlementRef);
 assert.equal((await verifyImmutableGeneration(root,day,next.generation)).receipt.ref,ref);
}));
test('activation switches only after caller explicitly invokes it',()=>env(async({root,stage})=>{
 const old=await initial(root,stage),next=await prepare(root);
 await activateSettlementRevision(root,next);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,next.generation);
 assert.equal((await fs.readFile(path.join(old.directory,'runtime','value-comparison.json'),'utf8')).includes('OLD'),true);
}));
test('injected pre-prepare failure leaves old pointer unchanged',()=>env(async({root,stage})=>{
 const old=await initial(root,stage);
 await assert.rejects(prepare(root,{faultAt:'before_prepare'}),/injected_before_prepare/);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,old.generation);
}));
test('injected post-prepare failure leaves old pointer unchanged',()=>env(async({root,stage})=>{
 const old=await initial(root,stage);
 await assert.rejects(prepare(root,{faultAt:'after_prepare'}),/injected_after_prepare/);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,old.generation);
}));
test('corrupt active generation is denied; no legacy fallback',()=>env(async({root,stage})=>{
 const old=await initial(root,stage);
 await fs.writeFile(path.join(old.directory,'runtime','value-comparison.json'),'tampered');
 await assert.rejects(prepare(root),/file_hash_mismatch/);
}));
test('malformed existing pointer is denied; no legacy fallback',()=>env(async({root,stage})=>{
 await initial(root,stage);
 await fs.writeFile(path.join(root,'.snapshot-sync','immutable-generations',day,'current.json'),'not json');
 await assert.rejects(prepare(root),/pointer_missing_or_invalid/);
}));
test('actual settlement writer prepares revision after drain and activates after mutable mirrors',async()=>{
 const source=(await fs.readFile(new URL('./sync-deploy-snapshot-from-github.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
 const start=source.indexOf('async function syncValueComparison('),end=source.indexOf('async function syncMultiOdds(',start);
 const body=source.slice(start,end);
 const guard=body.indexOf('const publication = await beginPublication(');
 const drain=body.indexOf('await waitForPublicationReadersToDrain(');
 const prepare=body.indexOf('const settlementRevision = await prepareSettlementRevision(');
 const mirror=body.indexOf('await writeFileAtomic(\n      runtimeTarget,');
 const root=body.indexOf('await writeFileAtomic(\n    target,');
 const activate=body.indexOf('await activateSettlementRevision(');
 const unlock=body.indexOf('await finishPublication(');
 assert.ok(guard>=0&&drain>guard&&prepare>drain&&mirror>prepare&&root>mirror&&activate>root&&unlock>activate);
});
