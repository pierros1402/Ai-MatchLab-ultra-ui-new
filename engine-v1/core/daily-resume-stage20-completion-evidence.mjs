// Evidence-only Stage20 completion binding: never activates stage skipping.
// Every observed producer output must be covered by a reproducible full-tree
// inventory and a verified byte-exact sandbox replay of the delta archive.
import {verifyDataInventory,compareDataInventories} from "./daily-resume-complete-data-inventory.mjs";
import {STAGE20_REPLAY_PARITY_SCHEMA} from "./daily-resume-stage20-replay-parity.mjs";
import {STAGE20_TRANSPORT_BUDGET_SCHEMA} from "./daily-resume-stage20-transport-budget.mjs";
import {evaluateStage20CapturePaths} from "./daily-resume-stage20-admission.mjs";
export const STAGE20_COMPLETION_EVIDENCE_SCHEMA =
  "ai-matchlab.daily-stage20-completion-evidence-admission.v1";
const SHA40=/^[a-f0-9]{40}$/, SHA256=/^[a-f0-9]{64}$/;
const RUN=/^[1-9][0-9]{0,18}$/;
const deny=(reason)=>({schema:STAGE20_COMPLETION_EVIDENCE_SCHEMA,
  evidenceQualified:false,reason,checkpointReusable:false,
  stageCodeCompatibilityVerified:false,dependencyDAGVerified:false,
  resumeAuthorized:false,publicationAuthorized:false});
export function evaluateStage20CompletionEvidence({
  dayKey,producerCommit,runId,runAttempt,cycle,
  preInventory,postInventory,transport,parity
}={}) {
  if(typeof dayKey!=="string" || !SHA40.test(producerCommit||"") ||
    !RUN.test(String(runId||"")) || !Number.isSafeInteger(Number(runId)) ||
    !Number.isSafeInteger(runAttempt) || runAttempt<1)
    return deny("stage20_completion_binding_invalid");
  // Only an exit-code-zero completed original cycle can be a Stage20 source.
  // A success flag copied out of a failed/interrupted run is never enough.
  if(cycle?.stageId!=="daily-cycle" || cycle.dayKey!==dayKey ||
    cycle.producerCommit!==producerCommit || String(cycle.runId)!==String(runId) ||
    cycle.runAttempt!==runAttempt || cycle.status!=="completed" ||
    cycle.exitCode!==0 || cycle.signal!==null || cycle.stageComplete!==true)
    return deny("stage20_completion_cycle_unproven");
  if(!verifyDataInventory(preInventory).ok ||
    !verifyDataInventory(postInventory).ok ||
    preInventory.dayKey!==dayKey || postInventory.dayKey!==dayKey ||
    preInventory.sourceCommit!==producerCommit ||
    postInventory.sourceCommit!==producerCommit)
    return deny("stage20_completion_inventory_unverified");
  let delta;
  try { delta=compareDataInventories(preInventory,postInventory); }
  catch {return deny("stage20_completion_inventory_delta_invalid");}
  // Require a non-empty authorized captured delta. A checksum-matching
  // synthetic receipt cannot bypass the source-owned path policy, even when
  // its aggregate path/byte counts agree with both full-tree inventories.
  const pathAdmission=evaluateStage20CapturePaths({
    dayKey,paths:delta.changes.map(item=>item.path)
  });
  if(pathAdmission.ok!==true)
    return deny("stage20_completion_delta_path_policy_denied");
  const finalFiles=new Map(postInventory.files.map(item=>[item.path,item]));
  const exactWriteBytes=delta.changes.reduce((total,entry)=>
    total+(entry.action==="delete"?0:(finalFiles.get(entry.path)?.bytes??NaN)),0);
  if(!Number.isSafeInteger(exactWriteBytes) ||
    transport?.deltaWriteBytes!==exactWriteBytes)
    return deny("stage20_completion_transport_write_bytes_unbound");
  if(transport?.schema!==STAGE20_TRANSPORT_BUDGET_SCHEMA ||
    transport.budgetEligible!==true || transport.producerCommit!==producerCommit ||
    transport.physicalDataFiles!==postInventory.fileCount ||
    transport.physicalDataBytes!==postInventory.totalBytes ||
    transport.deltaPaths!==delta.changes.length ||
    transport.ignoredDataFiles!==0 || transport.unaccountedDataFiles!==0 ||
    transport.completeCheckpointProven!==false ||
    transport.resumeAuthorized!==false || transport.publicationAuthorized!==false)
    return deny("stage20_completion_transport_unbound");
  if(parity?.schema!==STAGE20_REPLAY_PARITY_SCHEMA ||
    parity.ok!==true || parity.dayKey!==dayKey ||
    parity.baseCommit!==producerCommit ||
    parity.fileCount!==postInventory.fileCount ||
    parity.totalBytes!==postInventory.totalBytes ||
    parity.fullTreeInventorySha256!==postInventory.manifestSha256 ||
    !SHA256.test(parity.checkpointSha256||"") ||
    parity.sandboxReplayVerified!==true || parity.ignoredIncluded!==true ||
    parity.writerQuiescenceAttested!==false ||
    parity.stageCompleteVerified!==false || parity.resumeAuthorized!==false ||
    parity.publicationAuthorized!==false)
    return deny("stage20_completion_parity_unbound");
  // Transport byte size requires a real archive writer receipt and independently
  // audited manifest. A pure path-count budget does not authorize byte reuse.
  return {schema:STAGE20_COMPLETION_EVIDENCE_SCHEMA,
    evidenceQualified:true,reason:null,dayKey,producerCommit,
    runId:String(runId),runAttempt,
    sourceTreeSha256:postInventory.manifestSha256,
    preTreeSha256:preInventory.manifestSha256,
    changedPaths:delta.changes.length,
    checkpointSha256:parity.checkpointSha256,
    completePhysicalTreeParity:true,
    // No live-FT freshness, source compatibility, dependency-DAG authority,
    // writer lease, freshness or publication verification established here.
    checkpointReusable:false,stageCodeCompatibilityVerified:false,
    dependencyDAGVerified:false,resumeAuthorized:false,publicationAuthorized:false};
}
