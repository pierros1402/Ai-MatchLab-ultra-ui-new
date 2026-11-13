import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readPinnedRuntimeArtifact} from './runtime-generation-artifact-reader.js';
import {prepareImmutableGeneration,activateImmutableGeneration} from './runtime-immutable-generation.js';
const day='2026-11-12',ref='a'.repeat(40),hash='b'.repeat(64);
async function scenario(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'aiml-v35k-'));const stage=path.join(root,'stage');await fs.mkdir(path.join(stage,'runtime'),{recursive:true});await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({ok:true,hash,date:day}));await fs.writeFile(path.join(stage,'runtime','value-comparison.json'),JSON.stringify({date:day,plans:{A:{}}}));await fs.writeFile(path.join(stage,'runtime','system-health-alerts.json'),JSON.stringify({dayKey:day,status:'info'}));try{await fn({root,stage})}finally{await fs.rm(root,{recursive:true,force:true})}}
async function publish({root,stage}){const p=await prepareImmutableGeneration({dataRoot:root,day,ref,manifestHash:hash,sourceDir:stage});await activateImmutableGeneration(root,p);return p}
const read=(root,name,options={})=>readPinnedRuntimeArtifact({dataRoot:root,day,name,...options});
test('legacy no pointer remains opt-in compatible',()=>scenario(async x=>{assert.equal((await read(x.root,'value-comparison.json')).mode,'LEGACY');await assert.rejects(read(x.root,'value-comparison.json',{strict:true}),/generation_required/)}));
test('pinned comparison reads verified generation',()=>scenario(async x=>{await publish(x);const r=await read(x.root,'value-comparison.json');assert.equal(r.mode,'PINNED');assert.equal(r.payload.date,day)}));
test('pinned health alerts read the requested day',()=>scenario(async x=>{await publish(x);const r=await read(x.root,'system-health-alerts.json');assert.equal(r.payload.dayKey,day)}));
test('settlement drift after generation blocks stale WIN LOSS',()=>scenario(async x=>{await publish(x);const mirror=path.join(x.root,'value.json');await fs.writeFile(mirror,JSON.stringify({date:day,settled:'WIN'}));await assert.rejects(read(x.root,'value-comparison.json',{mirrorPaths:[mirror]}),/mirror_generation_divergence/)}));
test('exact mirrors accept same generation only',()=>scenario(async x=>{await publish(x);const mirror=path.join(x.root,'value.json');await fs.copyFile(path.join(x.stage,'runtime','value-comparison.json'),mirror);assert.equal((await read(x.root,'value-comparison.json',{mirrorPaths:[mirror]})).mode,'PINNED')}));
test('generation corruption fails closed',()=>scenario(async x=>{const p=await publish(x);await fs.writeFile(path.join(p.directory,'runtime','value-comparison.json'),'{}');await assert.rejects(read(x.root,'value-comparison.json'),/file_hash_mismatch/)}));
test('malformed pointer fails closed',()=>scenario(async x=>{await publish(x);await fs.writeFile(path.join(x.root,'.snapshot-sync','immutable-generations',day,'current.json'),'{');await assert.rejects(read(x.root,'value-comparison.json'),/pointer_missing_or_invalid/)}));
test('missing required artifact is blocked even with verified inventory',()=>scenario(async x=>{await fs.rm(path.join(x.stage,'runtime','value-comparison.json'));await publish(x);await assert.rejects(read(x.root,'value-comparison.json'),/required_artifact_missing/)}));
test('wrong day in embedded artifact blocked',()=>scenario(async x=>{await fs.writeFile(path.join(x.stage,'runtime','system-health-alerts.json'),JSON.stringify({dayKey:'2026-11-11'}));await publish(x);await assert.rejects(read(x.root,'system-health-alerts.json'),/artifact_day_mismatch/)}));
test('unknown artifact names blocked',()=>scenario(async x=>{await assert.rejects(read(x.root,'../../secrets'),/invalid_locator/)}));
test('routes are opt-in and leave Value-picks unchanged',async()=>{const index=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');assert.match(index,/AIML_V35K_GENERATION_READS/);assert.match(index,/app\.get\("\/value-comparison", async/);assert.match(index,/app\.get\("\/system-health-alerts", async/);assert.match(index,/app\.get\("\/value-picks", async/);assert.match(index,/readValueComparisonArtifact\(date,checked\.file\)/)});
