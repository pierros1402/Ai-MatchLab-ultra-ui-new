// V3.5K qualification-only runtime artifact binding. No source truth or settlement writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readPinnedImmutableGeneration } from './runtime-immutable-generation.js';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const NAMES=new Set(['value-comparison.json','system-health-alerts.json']);
const fail=why=>{throw new Error(`runtime_artifact_generation_${why}`)};
export async function readPinnedRuntimeArtifact({dataRoot,day,name,strict=false,mirrorPaths=[]}){
 if(typeof dataRoot!=='string'||!path.isAbsolute(dataRoot)||typeof day!=='string'||!DAY.test(day)||!NAMES.has(name))fail('invalid_locator');
 const pointer=path.join(dataRoot,'.snapshot-sync','immutable-generations',day,'current.json');
 try{await fs.lstat(pointer);}catch(e){if(e?.code!=='ENOENT')fail('pointer_stat_failed');if(strict)fail('generation_required');return {mode:'LEGACY'};}
 const pin=await readPinnedImmutableGeneration(dataRoot,day);
 const file=path.join(pin.directory,'runtime',name);
 let bytes;
 try{bytes=await fs.readFile(file);}catch{fail('required_artifact_missing');}
 let payload;
 try{payload=JSON.parse(bytes.toString('utf8'));}catch{fail('artifact_invalid_json');}
 if(name==='value-comparison.json' && payload?.date!==day)fail('artifact_day_mismatch');
 if(name==='system-health-alerts.json' && payload?.dayKey!==day)fail('artifact_day_mismatch');
 // A settlement-only writer modifies embedded and mutable Value mirrors without
 // activating a new generation. Reject stale pinned Value; never return stale WIN/LOSS.
 for(const mirror of mirrorPaths){
   if(typeof mirror!=='string'||!path.isAbsolute(mirror))fail('mirror_invalid');
   let mirrorBytes;
   try{mirrorBytes=await fs.readFile(mirror);}catch(e){if(e?.code==='ENOENT')continue;fail('mirror_read_failed');}
   if(!mirrorBytes.equals(bytes))fail('mirror_generation_divergence');
 }
 return {mode:'PINNED',file,payload,day,generation:pin.generation,ref:pin.ref};
}
