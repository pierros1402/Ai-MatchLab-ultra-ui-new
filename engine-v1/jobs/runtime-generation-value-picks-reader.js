// V3.5M: opt-in snapshot value-picks generation reader; no mutation or policy changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readPinnedImmutableGeneration } from './runtime-immutable-generation.js';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = reason => { throw new Error(`runtime_value_picks_generation_${reason}`); };
export async function readPinnedValuePicksSnapshot({dataRoot,day,strict=false,mirrorPath}) {
 if(typeof dataRoot!=='string'||!path.isAbsolute(dataRoot)||!DAY.test(day)||typeof mirrorPath!=='string'||!path.isAbsolute(mirrorPath))fail('invalid_locator');
 const pointer=path.join(dataRoot,'.snapshot-sync','immutable-generations',day,'current.json');
 try{await fs.lstat(pointer);}catch(e){
   if(e?.code!=='ENOENT')fail('pointer_stat_failed');
   if(strict)fail('generation_required');
   return {mode:'LEGACY'};
 }
 const pin=await readPinnedImmutableGeneration(dataRoot,day);
 const valuePath=path.join(pin.directory,'value.json');
 let bytes;try{bytes=await fs.readFile(valuePath);}catch{fail('value_missing');}
 let payload;try{payload=JSON.parse(bytes.toString('utf8'));}catch{fail('value_invalid_json');}
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    (payload.date!=null&&payload.date!==day)||
    (payload.dayKey!=null&&payload.dayKey!==day)||
    !Array.isArray(payload.picks))fail('value_invalid_schema');
 let mirror;try{mirror=await fs.readFile(mirrorPath);}catch(e){
   if(e?.code==='ENOENT')fail('mirror_missing');fail('mirror_read_failed');
 }
 if(!bytes.equals(mirror))fail('mirror_divergence');
 let manifest;try{manifest=JSON.parse(await fs.readFile(path.join(pin.directory,'manifest.json'),'utf8'));}
 catch{fail('manifest_invalid');}
 if(manifest?.hash!==pin.manifestHash)fail('manifest_mismatch');
 return {mode:'PINNED', payload, manifest, generation:pin.generation, ref:pin.ref};
}
