// Fixed historical synthetic evidence only. Pure GitHub metadata admission;
// this never authorizes stage replay, resume or publication.
export const PINNED_INTERWORKFLOW_PRODUCER=Object.freeze({
  runId:45199830395,attempt:1,repositoryId:1141938751,
  repository:"pierros1402/Ai-MatchLab-ultra-ui-new",
  commit:"7849d7e30ab97da9ad382779f389017e244f4dc9",
  workflowPath:".github/workflows/p0-stage20-prepost-crossrunner.yml",
  event:"pull_request",
  artifactId:14830527353,
  artifactName:"aiml-prepost-synthetic-45199830395-1",
  digest:"sha256:cc67e3886eadf2fa27403fbb30a1df69f95033a52c62f78ab7e54924e0eb1d14"
});
function fail(reason){return {downloadAdmissible:false,reason,
  resumeAuthorized:false,publicationAuthorized:false};}
export function inspectPinnedInterworkflowProducer(run,artifact,nowIso,
  pin=PINNED_INTERWORKFLOW_PRODUCER){
  if(!run||run.id!==pin.runId || run.run_attempt!==pin.attempt ||
    run.repository?.id!==pin.repositoryId ||
    run.repository?.full_name!==pin.repository ||
    run.head_repository?.id!==pin.repositoryId ||
    run.head_sha!==pin.commit ||
    run.path!==pin.workflowPath ||
    run.event!==pin.event ||
    run.status!=="completed" || run.conclusion!=="success")
    return fail("synthetic_source_workflow_not_pinned");
  if(!artifact||artifact.id!==pin.artifactId ||
    artifact.name!==pin.artifactName || artifact.digest!==pin.digest ||
    artifact.expired!==false ||
    artifact.workflow_run?.id!==pin.runId ||
    artifact.workflow_run?.repository_id!==pin.repositoryId ||
    artifact.workflow_run?.head_sha!==pin.commit ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes<=0 ||
    artifact.size_in_bytes>512*1024*1024)
    return fail("synthetic_artifact_custody_invalid");
  const now=Date.parse(nowIso),created=Date.parse(artifact.created_at),
    expires=Date.parse(artifact.expires_at);
  if(![now,created,expires].every(Number.isFinite) ||
    now<created || expires<=now || now-created>24*60*60*1000)
    return fail("synthetic_artifact_stale_or_expired");
  return {
    downloadAdmissible:true,reason:null,runId:pin.runId,
    artifactId:pin.artifactId,expectedDigest:pin.digest,
    sourceCommit:pin.commit,resumeAuthorized:false,
    publicationAuthorized:false
  };
}
