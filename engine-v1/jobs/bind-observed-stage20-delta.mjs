// Evidence-only bridge from observed boundaries to the verified physical delta.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { verifyDataInventory, compareDataInventories } from '../core/daily-resume-complete-data-inventory.mjs';
import { capturePrepostDeltaToIsolatedArchive, verifyPrepostDeltaArchive } from '../core/daily-resume-prepost-delta-archive.mjs';

export function bindObservedStage20Delta(root, tempRoot, dayKey) {
  assert.ok(path.isAbsolute(root) && path.isAbsolute(tempRoot));
  root=fs.realpathSync(root);
  assert.equal(fs.realpathSync(tempRoot),tempRoot);
  assert.ok(tempRoot!==root && !tempRoot.startsWith(root+path.sep), 'external_temp_required');
  assert.ok(fs.statSync(tempRoot).isDirectory());
  const read = name => {
    const p=path.join(tempRoot,name);
    const st=fs.lstatSync(p);
    assert.ok(st.isFile() && !st.isSymbolicLink(), 'invalid_observation_file');
    return JSON.parse(fs.readFileSync(p,'utf8'));
  };
  for(const name of ['aiml-stage20-failure-post.json','aiml-stage20-failure-delta.json','aiml-stage20-failure-summary.json'])
    assert.ok(!fs.existsSync(path.join(tempRoot,name)), 'failed_cycle_evidence_conflict');
  const before=read('aiml-stage20-pre.json'),after=read('aiml-stage20-post.json'),delta=read('aiml-stage20-delta.json');
  assert.ok(verifyDataInventory(before).ok && verifyDataInventory(after).ok, 'invalid_inventory');
  assert.equal(before.dayKey,dayKey);
  assert.equal(after.dayKey,dayKey);
  assert.ok(isDeepStrictEqual(delta,compareDataInventories(before,after)), 'observed_delta_mismatch');
  const target=path.join(tempRoot,'aiml-stage20-bound-delta');
  assert.ok(!fs.existsSync(target), 'bound_delta_exists');
  const receipt=capturePrepostDeltaToIsolatedArchive(root,target,before,after);
  try {
    const verified=verifyPrepostDeltaArchive(target,before,after);
    assert.ok(verified.ok && verified.evidenceSha256===receipt.checkpointSha256);
    return {schema:'ai-matchlab.stage20-observed-delta-binding.v1',dayKey,sourceCommit:before.sourceCommit,
      beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,checkpointSha256:receipt.checkpointSha256,
      entries:verified.entries,postCaptureTreeReattested:true,cycleSuccessVerified:false,
      completeBaseTreeIncluded:false,writerQuiescenceAttested:false,resumeAuthorized:false,publicationAuthorized:false};
  } catch(e) {fs.rmSync(target,{recursive:true,force:true});throw e;}
}

const publicDenialReasons = new Map([
  ['external_temp_required', 'INVALID_CAPTURE_ROOT'],
  ['invalid_observation_file', 'INVALID_OBSERVATION'],
  ['failed_cycle_evidence_conflict', 'FAILED_CYCLE_EVIDENCE'],
  ['invalid_inventory', 'INVALID_INVENTORY'],
  ['observed_delta_mismatch', 'OBSERVED_DELTA_MISMATCH'],
  ['bound_delta_exists', 'ARCHIVE_ALREADY_EXISTS'],
  ['stage20_prepost_paths_not_admitted', 'PATH_POLICY_DENIED'],
  ['stage20_prepost_delta_count_invalid', 'DELTA_COUNT_OUTSIDE_LIMIT'],
  ['stage20_prepost_delta_too_large', 'DELTA_BYTE_LIMIT'],
  ['stage20_prepost_head_drift', 'SOURCE_COMMIT_CHANGED'],
  ['stage20_prepost_source_drift', 'SOURCE_BYTES_CHANGED'],
  ['stage20_prepost_final_tree_drift', 'POST_INVENTORY_TREE_CHANGED'],
]);

export function publicStage20DenialReason(error) {
  return publicDenialReasons.get(error?.message) ?? 'UNKNOWN';
}

 // CLI emits only aggregate evidence; full inventories remain runner-local.
import {pathToFileURL} from 'node:url';
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try {
    assert.equal(process.argv.length,3);
    assert.ok(process.env.RUNNER_TEMP);
    const result=bindObservedStage20Delta(process.cwd(),process.env.RUNNER_TEMP,process.argv[2]);
    console.log('STAGE20_BOUND_DELTA='+JSON.stringify(result));
  } catch (error) {
    console.error('STAGE20_BOUND_DELTA_DENIED reason=' + publicStage20DenialReason(error));
    process.exitCode=1;
  }
}
