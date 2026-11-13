// V3.5L: settlement-only immutable revision, separate from snapshot ref.
// Caller must already own the exclusive publication marker and have drained readers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPinnedImmutableGeneration, prepareImmutableGeneration, activateImmutableGeneration } from './runtime-immutable-generation.js';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const REF=/^[a-f0-9]{40}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=reason=>{throw new Error(`settlement_generation_${reason}`);};
async function copyVerifiedTree(from,to){
  for(const entry of await fs.readdir(from,{withFileTypes:true})){
    if(entry.name==='.generation-receipt.json')continue;
    if(entry.isSymbolicLink()||(!entry.isFile()&&!entry.isDirectory()))fail('nonregular_source');
    const source=path.join(from,entry.name),target=path.join(to,entry.name);
    if(entry.isDirectory()){await fs.mkdir(target);await copyVerifiedTree(source,target);}
    else await fs.copyFile(source,target,0);
  }
}
export async function prepareSettlementRevision({dataRoot,day,settlementRef,comparisonBytes,faultAt=null}){
  if(typeof dataRoot!=='string'||!path.isAbsolute(dataRoot)||!DAY.test(day)||!REF.test(settlementRef)||
     !Buffer.isBuffer(comparisonBytes))fail('invalid_arguments');
  const pointerFile=path.join(dataRoot,'.snapshot-sync','immutable-generations',day,'current.json');
  try{await fs.lstat(pointerFile);}catch(e){if(e?.code==='ENOENT')return null;throw e;}
  // Verify every byte of the currently active generation BEFORE using it as the next base.
  const pinned=await readPinnedImmutableGeneration(dataRoot,day);
  const stagingHome=path.join(dataRoot,'.snapshot-sync','settlement-stages');
  await fs.mkdir(stagingHome,{recursive:true});
  const stage=await fs.mkdtemp(path.join(stagingHome,`day-${day}-`));
  try{
    await copyVerifiedTree(pinned.directory,stage);
    await fs.mkdir(path.join(stage,'runtime'),{recursive:true});
    await fs.writeFile(path.join(stage,'runtime','value-comparison.json'),comparisonBytes);
    const provenance={schema:'aiml.runtime-settlement-provenance.v35l',day,settlementRef,comparisonSha256:sha(comparisonBytes)};
    await fs.writeFile(path.join(stage,'runtime','settlement-source.json'),JSON.stringify(provenance)+'\n');
    if(faultAt==='before_prepare')fail('injected_before_prepare');
    // Retain original snapshot manifest/ref; settlement source is separately hashed provenance.
    const prepared=await prepareImmutableGeneration({
      dataRoot,day,ref:pinned.ref,manifestHash:pinned.manifestHash,sourceDir:stage
    });
    if(faultAt==='after_prepare')fail('injected_after_prepare');
    return {...prepared,settlementRef,comparisonSha256:provenance.comparisonSha256};
  }finally{await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});}
}
export async function activateSettlementRevision(dataRoot,prepared,options={}){
  if(!prepared||typeof prepared.settlementRef!=='string'||!REF.test(prepared.settlementRef))fail('unprepared_revision');
  return activateImmutableGeneration(dataRoot,prepared,options);
}
