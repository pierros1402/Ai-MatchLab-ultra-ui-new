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

// Read-only retries tolerate transient Render transport errors without repeating
// an authenticated synchronization request whose outcome might be unknown.
export async function readPublicSnapshot(day,{fetchImpl=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=3}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('public_parity_day_required');
  if(!Number.isInteger(attempts)||attempts<1||attempts>3)throw Error('public_parity_retry_budget_invalid');
  for(let attempt=1;attempt<=attempts;attempt++){
    try {
      const response=await fetchImpl(`https://ai-matchlab-engine.onrender.com/deploy-snapshot?date=${day}`,{signal:AbortSignal.timeout(30000)});
      if(response.status===404)return null;
      if(response.ok)return await response.json();
      const error=Error('public_parity_read_failed:'+response.status);
      error.retryable=[408,429,500,502,503,504].includes(response.status);
      throw error;
    } catch(error) {
      if(attempt===attempts||error.retryable===false)throw error;
      await wait(1000*attempt);
    }
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [day,ref]=process.argv.slice(2);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('public_parity_day_required');
  const root=`data/deploy-snapshots/${day}`;
  const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json','utf8'));
  const {validateStagedRelease}=await import('../engine-v1/jobs/sync-deploy-snapshot-from-github.js');
  await validateStagedRelease(root,manifest);
  const publicRelease=await readPublicSnapshot(day);
  const result=await reconcilePublicSnapshot({day,ref,manifest,publicRelease,
    synchronize:(day,ref)=>execFileSync('bash',['tools/sync-public-snapshot.sh',day,ref],{stdio:'inherit',env:process.env,timeout:900_000})});
  console.log('PUBLIC_SNAPSHOT_PARITY='+JSON.stringify(result));
}
