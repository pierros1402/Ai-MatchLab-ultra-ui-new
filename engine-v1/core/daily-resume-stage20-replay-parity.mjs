// Read-only Stage20 full-tree replay parity. Does not enable production resume.
// Restore is constrained to an isolated clone and deleted before returning.
import fs from "node:fs";
import os from "node:os";
import {inspectStage20Worktree} from "../jobs/capture-stage20-worktree.mjs";
import {
  inspectDailyWorktreeDelta, replayDailyWorktreeDeltaToIsolatedClone
} from "./daily-resume-worktree-delta.mjs";
import {inventoryStableDataTree} from "./daily-resume-stable-data-scan.mjs";

export const STAGE20_REPLAY_PARITY_SCHEMA =
  "ai-matchlab.daily-stage20-full-tree-replay-parity.v1";
function check(condition, code) { if (!condition) throw Error(code); }

/**
 * Proves physical data/ tree parity, including tracked, untracked and ignored
 * files. A successful result is evidence only, never stage-skip authorization.
 * The source tree is only read; replay touches a disposable clone.
 */
export function verifyStage20ReplayParity(repoRoot, archiveRoot, options, parent=os.tmpdir()) {
  let clone=null;
  try {
    check(options && typeof options.dayKey==="string" &&
      typeof options.baseCommit==="string" &&
      Array.isArray(options.allowedPrefixes) && options.stageId==="daily-cycle",
      "stage20_parity_options_invalid");
    const source=inspectStage20Worktree(repoRoot,options.dayKey);
    check(source.ok,"stage20_parity_source_denied:"+source.reason);
    check(source.baseCommit===options.baseCommit,
      "stage20_parity_source_commit_mismatch");
    const inspected=inspectDailyWorktreeDelta(archiveRoot,options);
    check(inspected.ok,"stage20_parity_archive_denied:"+inspected.reason);
    const original=inventoryStableDataTree(repoRoot,options.dayKey);
    check(original.stability.ok &&
      original.stability.writerQuiescenceAttested===false,
      "stage20_parity_source_unstable");
    const restored=replayDailyWorktreeDeltaToIsolatedClone(
      repoRoot,archiveRoot,options,parent);
    clone=restored.stagingClone;
    const replayed=inventoryStableDataTree(clone,options.dayKey);
    check(replayed.stability.ok,"stage20_parity_replay_unstable");
    check(original.inventory.manifestSha256===replayed.inventory.manifestSha256,
      "stage20_parity_full_tree_mismatch");
    // A concurrent writer after the initial two passes must not be hidden.
    const finalSource=inventoryStableDataTree(repoRoot,options.dayKey);
    check(finalSource.inventory.manifestSha256===original.inventory.manifestSha256,
      "stage20_parity_source_drift");
    return {
      schema:STAGE20_REPLAY_PARITY_SCHEMA,ok:true,
      dayKey:options.dayKey,baseCommit:options.baseCommit,
      checkpointSha256:inspected.checkpointSha256,
      fullTreeInventorySha256:original.inventory.manifestSha256,
      fileCount:original.inventory.fileCount,totalBytes:original.inventory.totalBytes,
      ignoredIncluded:true,trackedIncluded:true,untrackedIncluded:true,
      sandboxReplayVerified:true,writerQuiescenceAttested:false,
      codeCompatibilityVerified:false,stageCompleteVerified:false,
      resumeAuthorized:false,publicationAuthorized:false
    };
  }finally {
    if(clone)fs.rmSync(clone,{recursive:true,force:true});
  }
}
