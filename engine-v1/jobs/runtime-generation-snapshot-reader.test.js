import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readSnapshotManifestGeneration } from './runtime-generation-snapshot-reader.js';
import { prepareImmutableGeneration, activateImmutableGeneration } from './runtime-immutable-generation.js';
const day='2026-11-12',ref='a'.repeat(40),hash='b'.repeat(64);
async function fixture(fn) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35j-'));
 const src=path.join(root,'stage'); await fs.mkdir(src);
 await fs.writeFile(path.join(src,'manifest.json'), JSON.stringify({ok:true,hash,date:day}));
 await fs.writeFile(path.join(src,'fixtures.json'),'[]');
 try { await fn({root,src}); } finally { await fs.rm(root,{force:true,recursive:true}); }
}
const publish=async({root,src})=>{const p=await prepareImmutableGeneration({dataRoot:root,day,ref,manifestHash:hash,sourceDir:src});await activateImmutableGeneration(root,p);return p;};
test('legacy missing pointer allowed only when strict mode is off',()=>fixture(async({root})=>{
 assert.equal((await readSnapshotManifestGeneration({dataRoot:root,day})).mode,'LEGACY');
 await assert.rejects(readSnapshotManifestGeneration({dataRoot:root,day,strict:true}),/generation_required/);
}));
test('published generation pinned by exact day and latest hash',()=>fixture(async x=>{
 await publish(x);
 const read=await readSnapshotManifestGeneration({dataRoot:x.root,day,latest:{date:day,hash},strict:true});
 assert.equal(read.mode,'PINNED'); assert.equal(read.manifest.hash,hash);
 assert.equal(read.ref,ref);
}));
test('latest hash mismatch cannot fall back to legacy root',()=>fixture(async x=>{
 await publish(x);await assert.rejects(readSnapshotManifestGeneration({dataRoot:x.root,day,latest:{date:day,hash:'c'.repeat(64)}}),/latest_generation_mismatch/);
}));
test('latest wrong day cannot pass',()=>fixture(async x=>{
 await publish(x);await assert.rejects(readSnapshotManifestGeneration({dataRoot:x.root,day,latest:{date:'2026-11-11',hash}}),/latest_generation_mismatch/);
}));
test('tampered generation cannot fall back to root mirror',()=>fixture(async x=>{
 const p=await publish(x);await fs.writeFile(path.join(p.directory,'fixtures.json'),'[1]');
 await assert.rejects(readSnapshotManifestGeneration({dataRoot:x.root,day}),/file_hash_mismatch/);
}));
test('corrupted pointer denies, not legacy fallback',()=>fixture(async x=>{
 await publish(x);const p=path.join(x.root,'.snapshot-sync','immutable-generations',day,'current.json');await fs.writeFile(p,'{');
 await assert.rejects(readSnapshotManifestGeneration({dataRoot:x.root,day}),/pointer_missing_or_invalid/);
}));
test('a captured generation is byte-stable after pointer switch',()=>fixture(async x=>{
 await publish(x);const first=await readSnapshotManifestGeneration({dataRoot:x.root,day});
 await fs.writeFile(path.join(x.src,'fixtures.json'),'[2]');await publish(x);
 assert.equal((await readSnapshotManifestGeneration({dataRoot:x.root,day})).mode,'PINNED');
 assert.equal(first.manifest.hash,hash);assert.equal(first.mode,'PINNED');
}));
test('index uses generation-bound read in two actual HTTP routes',async()=>{
 const index=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');
 assert.match(index,/app\.get\("\/deploy-snapshot\/latest", async/);
 assert.match(index,/app\.get\("\/deploy-snapshot", async/);
 assert.equal((index.match(/await readSnapshotManifestGeneration\(/g)||[]).length,2);
});
