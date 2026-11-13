import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareImmutableGeneration,activateImmutableGeneration} from './runtime-immutable-generation.js';
import {readPinnedValuePicksSnapshot} from './runtime-generation-value-picks-reader.js';
const day='2026-11-12';
const ref='a'.repeat(40);
const hash='b'.repeat(64);
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35m-'));
 const stage=path.join(root,'stage');const data=path.join(root,'data');
 const mirror=path.join(data,'deploy-snapshots',day,'value.json');
 await fs.mkdir(stage);await fs.mkdir(path.dirname(mirror),{recursive:true});
 const value=Buffer.from(JSON.stringify({ok:true,date:day,picks:[{matchId:'one',result:'WIN'}]})+'\n');
 await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({hash,generatedAt:'2026-11-12T00:00:00Z',counts:{details:1,fixtures:2}}));
 await fs.writeFile(path.join(stage,'value.json'),value);await fs.writeFile(mirror,value);
 try{await fn({root,stage,data,mirror,value});}finally{await fs.rm(root,{recursive:true,force:true});}
}
async function publish(t){return activateImmutableGeneration(t.data,await prepareImmutableGeneration({dataRoot:t.data,day,ref,manifestHash:hash,sourceDir:t.stage}));}
const read=t=>readPinnedValuePicksSnapshot({dataRoot:t.data,day,mirrorPath:t.mirror});
test('no pointer remains legacy only when not strict',async()=>fixture(async t=>{assert.equal((await read(t)).mode,'LEGACY');await assert.rejects(readPinnedValuePicksSnapshot({dataRoot:t.data,day,mirrorPath:t.mirror,strict:true}),/generation_required/);}));
test('verified generation serves the exact value picks',async()=>fixture(async t=>{await publish(t);const out=await read(t);assert.equal(out.mode,'PINNED');assert.equal(out.payload.picks[0].result,'WIN');assert.equal(out.manifest.hash,hash);}));
test('changed mutable snapshot value is held, never silently used',async()=>fixture(async t=>{await publish(t);await fs.writeFile(t.mirror,JSON.stringify({date:day,picks:[{result:'LOSS'}]}));await assert.rejects(read(t),/mirror_divergence/);}));
test('missing mirror is held instead of generating a partial empty view',async()=>fixture(async t=>{await publish(t);await fs.unlink(t.mirror);await assert.rejects(read(t),/mirror_missing/);}));
test('corrupt immutable bytes deny fallback',async()=>fixture(async t=>{const pointer=await publish(t);await fs.writeFile(path.join(t.data,'.snapshot-sync','immutable-generations',day,'versions',pointer.generation,'value.json'),'{}');await assert.rejects(read(t),/file_hash_mismatch/);}));
test('malformed pointer denies fallback',async()=>fixture(async t=>{await publish(t);await fs.writeFile(path.join(t.data,'.snapshot-sync','immutable-generations',day,'current.json'),'bad');await assert.rejects(read(t),/pointer_missing_or_invalid/);}));
test('wrong snapshot day in value is held',async()=>fixture(async t=>{const bad=Buffer.from(JSON.stringify({date:'2026-11-11',picks:[]})+'\n');await fs.writeFile(path.join(t.stage,'value.json'),bad);await fs.writeFile(t.mirror,bad);await publish(t);await assert.rejects(read(t),/value_invalid_schema/);}));
test('missing picks inventory is held',async()=>fixture(async t=>{const bad=Buffer.from(JSON.stringify({date:day})+'\n');await fs.writeFile(path.join(t.stage,'value.json'),bad);await fs.writeFile(t.mirror,bad);await publish(t);await assert.rejects(read(t),/value_invalid_schema/);}));
test('request pin remains stable after later activation',async()=>fixture(async t=>{await publish(t);const old=await read(t);const newBytes=Buffer.from(JSON.stringify({date:day,picks:[{result:'LOSS'}]})+'\n');await fs.writeFile(path.join(t.stage,'value.json'),newBytes);await fs.writeFile(t.mirror,newBytes);await publish(t);const newer=await read(t);assert.equal(old.payload.picks[0].result,'WIN');assert.equal(newer.payload.picks[0].result,'LOSS');}));
test('actual route has explicit opt-in and no changes to runtime-build fallback',async()=>{
 const source=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');
 const section=source.split('app.get("/value-picks", async (req, res) => {')[1]?.split('// Map a value pick')[0];
 assert.ok(section);assert.match(section,/AIML_V35M_VALUE_PICKS_GENERATION_READS/);
 assert.match(section,/readPinnedRuntimeArtifact/);assert.match(section,/readPinnedValuePicksSnapshot/);
 assert.match(section,/if \(runtimeBuildsDisabled\(\)\)/);assert.match(section,/buildValueDay\(date, \{ rebuild \}\)/);
 assert.match(section,/value_picks_generation_divergence/);
});
