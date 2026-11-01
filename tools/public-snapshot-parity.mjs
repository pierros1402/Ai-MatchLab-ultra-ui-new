import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateDeploySnapshotManifest} from '../engine-v1/core/deploy-snapshot-release-contract.js';

export function publicSnapshotParityDecision({day,ref,manifest,publicRelease}) {
  if(!/^[a-f0-9]{40}$/.test(ref||''))throw Error('public_parity_immutable_ref_required');
  const check=validateDeploySnapshotManifest(manifest,day);
  if(!check.ok)throw Error('public_parity_source_invalid:'+check.errors.join(','));
  return {day,ref,expectedHash:manifest.hash,publicHash:publicRelease?.manifest?.hash||null,
    action:publicRelease?.ok===true&&publicRelease.date===day&&publicRelease.manifest?.hash===manifest.hash?'VERIFIED':'SYNC_REQUIRED'};
}

export async function reconcilePublicSnapshot({day,ref,manifest,publicRelease,synchronize}) {
  const decision=publicSnapshotParityDecision({day,ref,manifest,publicRelease});
  if(decision.action==='SYNC_REQUIRED')await synchronize(day,ref);
  return decision;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [day,ref]=process.argv.slice(2);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('public_parity_day_required');
  const root=`data/deploy-snapshots/${day}`;
  const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json','utf8'));
  const {validateStagedRelease}=await import('../engine-v1/jobs/sync-deploy-snapshot-from-github.js');
  await validateStagedRelease(root,manifest);
  const response=await fetch(`https://ai-matchlab-engine.onrender.com/deploy-snapshot?date=${day}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok&&response.status!==404)throw Error('public_parity_read_failed:'+response.status);
  const result=await reconcilePublicSnapshot({day,ref,manifest,publicRelease:response.ok?await response.json():null,
    synchronize:(day,ref)=>execFileSync('bash',['tools/sync-public-snapshot.sh',day,ref],{stdio:'inherit',env:process.env,timeout:900_000})});
  console.log('PUBLIC_SNAPSHOT_PARITY='+JSON.stringify(result));
}
