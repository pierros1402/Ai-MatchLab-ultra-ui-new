// Stage20 byte-transport budget preflight. This does not build or restore archives.
// Real total data-tree size is NOT the byte count of a delta from committed HEAD.
export const STAGE20_TRANSPORT_BUDGET_SCHEMA="ai-matchlab.stage20-transport-budget.v1";
export const STAGE20_DELTA_MAX_FILES=10000;
export const STAGE20_DELTA_MAX_BYTES=512*1024*1024;
function deny(reason, context={}) {
  return {schema:STAGE20_TRANSPORT_BUDGET_SCHEMA,budgetEligible:false,reason,
    ...context,completeCheckpointProven:false,sourceContentVerified:false,
    stageCompleteVerified:false,writerQuiescenceAttested:false,
    resumeAuthorized:false,publicationAuthorized:false};
}
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function inspectStage20TransportBudget({
  physicalDataFiles,physicalDataBytes,deltaPaths,deltaWriteBytes,
  ignoredDataFiles,unaccountedDataFiles,producerCommit
}={}) {
  if(![physicalDataFiles,physicalDataBytes,deltaPaths,deltaWriteBytes,
    ignoredDataFiles,unaccountedDataFiles].every(valid) ||
    !/^[a-f0-9]{40}$/.test(producerCommit||"") ||
    physicalDataFiles===0 ||
    // deltaPaths includes tombstones absent from the POST physical tree.
    // Do not compare it with post-count: real deletions can exceed survivors.
    // The completion verifier independently recomputes the exact pre/post diff.
    deltaPaths===0 || deltaWriteBytes>physicalDataBytes ||
    ignoredDataFiles>physicalDataFiles || unaccountedDataFiles>physicalDataFiles)
    return deny("stage20_transport_evidence_invalid");
  const context={physicalDataFiles,physicalDataBytes,deltaPaths,deltaWriteBytes,
    ignoredDataFiles,unaccountedDataFiles,producerCommit,
    deltaMaxFiles:STAGE20_DELTA_MAX_FILES,deltaMaxBytes:STAGE20_DELTA_MAX_BYTES};
  if(ignoredDataFiles!==0 || unaccountedDataFiles!==0)
    return deny("stage20_transport_missing_physical_data",context);
  if(deltaPaths>STAGE20_DELTA_MAX_FILES)
    return deny("stage20_transport_path_budget_exceeded",context);
  if(deltaWriteBytes>STAGE20_DELTA_MAX_BYTES)
    return deny("stage20_transport_byte_budget_exceeded",context);
  return {schema:STAGE20_TRANSPORT_BUDGET_SCHEMA,budgetEligible:true,
    reason:null,...context,
    // Byte budget is necessary, not sufficient. Must still verify all source
    // file bytes, source baseline, full-tree replay, inputs and DAG contracts.
    completeCheckpointProven:false,sourceContentVerified:false,
    stageCompleteVerified:false,writerQuiescenceAttested:false,
    resumeAuthorized:false,publicationAuthorized:false};
}
