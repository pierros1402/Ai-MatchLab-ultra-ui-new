// Defense in depth for Stage20 filesystem observation: a full double scan
// detects non-quiescent data trees that change between read passes. It is
// NOT a writer lease, monotonic event log, or permission to resume/publish.
import {inventoryDataTree,verifyDataInventory,compareDataInventories} from "./daily-resume-complete-data-inventory.mjs";
export const STABLE_DATA_SCAN_SCHEMA="ai-matchlab.daily-stage20-two-pass-tree-stability.v1";
function check(ok,code){if(!ok)throw Error(code);}
export function compareStableDataPasses(first,second) {
  const a=verifyDataInventory(first),b=verifyDataInventory(second);
  check(a.ok && b.ok,"stage20_stability_inventory_invalid");
  check(first.dayKey===second.dayKey &&
    first.sourceCommit===second.sourceCommit,
    "stage20_stability_source_mismatch");
  const delta=compareDataInventories(first,second);
  if(delta.changes.length || first.manifestSha256!==second.manifestSha256) {
    return {
      schema:STABLE_DATA_SCAN_SCHEMA,ok:false,
      reason:"stage20_data_changed_between_passes",
      firstSha256:first.manifestSha256,secondSha256:second.manifestSha256,
      changedCount:delta.changes.length,
      added:delta.added,modified:delta.modified,deleted:delta.deleted,
      writerQuiescenceAttested:false,resumeAuthorized:false,
      publicationAuthorized:false
    };
  }
  return {
    schema:STABLE_DATA_SCAN_SCHEMA,ok:true,reason:null,
    dayKey:first.dayKey,sourceCommit:first.sourceCommit,
    inventorySha256:second.manifestSha256,
    fileCount:second.fileCount,totalBytes:second.totalBytes,
    changedCount:0,consecutivePasses:2,
    writerQuiescenceAttested:false,resumeAuthorized:false,
    publicationAuthorized:false
  };
}
export function inventoryStableDataTree(repoRoot,dayKey,{betweenPasses}={}) {
  check(betweenPasses===undefined || typeof betweenPasses==="function",
    "stage20_stability_hook_invalid");
  const first=inventoryDataTree(repoRoot,dayKey);
  // Controlled synchronous hook is only for isolated test fault injection.
  // Production runs do not supply a hook. No promise/time gap is invented.
  if(betweenPasses)betweenPasses();
  const second=inventoryDataTree(repoRoot,dayKey);
  const verdict=compareStableDataPasses(first,second);
  check(verdict.ok,"stage20_data_changed_between_passes");
  return {inventory:second,stability:verdict};
}
