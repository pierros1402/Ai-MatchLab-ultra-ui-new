import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
 prepareImmutableGeneration,activateImmutableGeneration,readPinnedImmutableGeneration,
 verifyImmutableGeneration
} from './runtime-immutable-generation.js';
const ref='a'.repeat(40),hash='b'.repeat(64),day='2026-11-12';
async function env(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35i-'));const src=path.join(root,'stage');await fs.mkdir(path.join(src,'runtime'),{recursive:true});await fs.writeFile(path.join(src,'manifest.json'),JSON.stringify({hash,dayKey:day}));await fs.writeFile(path.join(src,'runtime','value-comparison.json'),'{}');try{await fn({root,src});}finally{await fs.rm(root,{recursive:true,force:true});}}
const prep=(root,src,extra={})=>prepareImmutableGeneration({dataRoot:root,sourceDir:src,day,ref,manifestHash:hash,...extra});
test('generation is byte-verified and never replaces existing versions',()=>env(async({root,src})=>{
 const one=await prep(root,src);const two=await prep(root,src);
 assert.notEqual(one.generation,two.generation);
 assert.equal((await verifyImmutableGeneration(root,day,one.generation)).receipt.ref,ref);
 await fs.stat(path.join(one.directory,'runtime','value-comparison.json'));
}));
test('pointer remains absent before activation',()=>env(async({root,src})=>{
 await prep(root,src); await assert.rejects(readPinnedImmutableGeneration(root,day),/pointer_missing_or_invalid/);
}));
test('one activation switches pointer while an already-open generation remains readable',()=>env(async({root,src})=>{
 const one=await prep(root,src);await activateImmutableGeneration(root,one);
 const pinned=await readPinnedImmutableGeneration(root,day);
 await fs.writeFile(path.join(src,'runtime','value-comparison.json'),'{"new":true}');
 const two=await prep(root,src);await activateImmutableGeneration(root,two);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,two.generation);
 assert.equal((await fs.readFile(path.join(pinned.directory,'runtime','value-comparison.json'),'utf8')),'{}');
}));
test('failure before pointer leaves prior pointer unchanged',()=>env(async({root,src})=>{
 const one=await prep(root,src);await activateImmutableGeneration(root,one);
 const two=await prep(root,src);await assert.rejects(activateImmutableGeneration(root,two,{faultAt:'before_pointer'}),/injected_before_pointer/);
 assert.equal((await readPinnedImmutableGeneration(root,day)).generation,one.generation);
}));
test('a staging failure does not publish a pointer',()=>env(async({root,src})=>{
 await assert.rejects(prep(root,src,{faultAt:'before_receipt'}),/injected_before_receipt/);
 await assert.rejects(readPinnedImmutableGeneration(root,day),/pointer_missing_or_invalid/);
}));
test('post-rename failure retains immutable evidence and no pointer',()=>env(async({root,src})=>{
 await assert.rejects(prep(root,src,{faultAt:'after_rename'}),/injected_after_rename/);
 const dir=path.join(root,'.snapshot-sync','immutable-generations',day,'versions');
 assert.equal((await fs.readdir(dir)).length,1);
 await assert.rejects(readPinnedImmutableGeneration(root,day),/pointer_missing_or_invalid/);
}));
test('tampered generation never returns as verified',()=>env(async({root,src})=>{
 const g=await prep(root,src);await activateImmutableGeneration(root,g);
 await fs.writeFile(path.join(g.directory,'runtime','value-comparison.json'),'{"tampered":true}');
 await assert.rejects(readPinnedImmutableGeneration(root,day),/file_hash_mismatch/);
}));
test('malicious directory symlink or Windows junction stage entry is denied',()=>env(async({root,src})=>{
 await fs.mkdir(path.join(src,'junction-target'));
 await fs.symlink(path.join(src,'junction-target'),path.join(src,'bad-link'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(prep(root,src),/nonregular_file/);
}));
test('invalid manifest binding denied',()=>env(async({root,src})=>{
 await assert.rejects(prep(root,src,{manifestHash:'c'.repeat(64)}),/manifest_mismatch/);
}));
test('fake pointer traversal fails closed',()=>env(async({root})=>{
 const home=path.join(root,'.snapshot-sync','immutable-generations',day);
 await fs.mkdir(home,{recursive:true});
 await fs.writeFile(path.join(home,'current.json'),JSON.stringify({schema:'aiml.runtime-immutable-pointer.v35i',day,generation:'../../escape',ref,manifestHash:hash}));
 await assert.rejects(readPinnedImmutableGeneration(root,day),/pointer_invalid/);
}));
test('writer integration contains pre-guard capture and post-witness activation',async()=>{
 const src=await fs.readFile(new URL('./sync-deploy-snapshot-from-github.js',import.meta.url),'utf8');
 const capture=src.indexOf('const immutableGeneration = await prepareImmutableGeneration(');
 const guard=src.indexOf('const publication = await beginPublication(',capture);
 const witness=src.indexOf('await updateRuntimeSyncState(',guard);
 const activation=src.indexOf('await activateImmutableGeneration(',witness);
 const finish=src.indexOf('await finishPublication(',activation);
 assert.ok(capture>0&&guard>capture&&witness>guard&&activation>witness&&finish>activation);
});
