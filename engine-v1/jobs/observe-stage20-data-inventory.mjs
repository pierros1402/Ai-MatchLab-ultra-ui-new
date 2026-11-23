// Read-only Stage20 boundary observation, default OFF in production Daily.
// Outputs ONLY to explicitly checked RUNNER_TEMP; no archive/publish/resume.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  verifyDataInventory, compareDataInventories
} from "../core/daily-resume-complete-data-inventory.mjs";
import { inventoryStableDataTree } from "../core/daily-resume-stable-data-scan.mjs";
export const STAGE20_OBSERVATION_SCHEMA="ai-matchlab.daily-stage20-boundary-observation.v1";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function check(ok,code){if(!ok)throw Error(code);}
function runnerOutput(tempRoot,name) {
  check(typeof tempRoot==="string" && path.isAbsolute(tempRoot) &&
    ["aiml-stage20-pre.json","aiml-stage20-post.json","aiml-stage20-delta.json",
      "aiml-stage20-failure-post.json","aiml-stage20-failure-delta.json"].includes(name),
    "stage20_observation_temp_binding_invalid");
  const base=path.resolve(tempRoot);
  check(fs.existsSync(base) && fs.lstatSync(base).isDirectory() &&
    !fs.lstatSync(base).isSymbolicLink(),"stage20_observation_temp_missing");
  const canonical=fs.realpathSync(base);
  check(canonical===base,"stage20_observation_temp_symlink_forbidden");
  return path.join(base,name);
}
function atomicEvidence(file,document,tempRoot) {
  check(!fs.existsSync(file),"stage20_observation_evidence_exists");
  const directory=fs.mkdtempSync(path.join(tempRoot,".aiml-stage20-evidence-"));
  try {
    const pending=path.join(directory,"pending.json");
    fs.writeFileSync(pending,JSON.stringify(document),{flag:"wx",mode:0o600});
    check(!fs.existsSync(file),"stage20_observation_evidence_exists");
    // Same filesystem rename; no overwrite of existing evidence allowed.
    fs.linkSync(pending,file);
    fs.unlinkSync(pending);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
export function observeStage20Pre(root,dayKey,tempRoot,scanOptions={}) {
  check(DAY.test(dayKey),"stage20_observation_day_invalid");
  const file=runnerOutput(tempRoot,"aiml-stage20-pre.json");
  check(!fs.existsSync(file),"stage20_observation_evidence_exists");
  const {inventory,stability}=inventoryStableDataTree(root,dayKey,scanOptions);
  check(stability.ok && stability.writerQuiescenceAttested===false,
    "stage20_observation_stability_not_proven");
  check(verifyDataInventory(inventory).ok,"stage20_observation_pre_invalid");
  atomicEvidence(file,inventory,tempRoot);
  return {
    schema:STAGE20_OBSERVATION_SCHEMA,phase:"pre",dayKey,
    sourceCommit:inventory.sourceCommit,manifestSha256:inventory.manifestSha256,
    fileCount:inventory.fileCount,totalBytes:inventory.totalBytes,
    completeTreePreCaptured:true,consecutiveVerifiedPasses:stability.consecutivePasses,
    writerQuiescenceAttested:false,stageCaptureAuthorized:false,
    resumeAuthorized:false,publicationAuthorized:false
  };
}
export function observeStage20Post(root,dayKey,tempRoot,scanOptions={}) {
  check(DAY.test(dayKey),"stage20_observation_day_invalid");
  const beforeFile=runnerOutput(tempRoot,"aiml-stage20-pre.json");
  const afterFile=runnerOutput(tempRoot,"aiml-stage20-post.json");
  const deltaFile=runnerOutput(tempRoot,"aiml-stage20-delta.json");
  check(fs.existsSync(beforeFile) && !fs.lstatSync(beforeFile).isSymbolicLink(),
    "stage20_observation_pre_missing");
  check(!fs.existsSync(afterFile) && !fs.existsSync(deltaFile),
    "stage20_observation_evidence_exists");
  const before=JSON.parse(fs.readFileSync(beforeFile,"utf8"));
  check(verifyDataInventory(before).ok && before.dayKey===dayKey,
    "stage20_observation_pre_invalid");
  const {inventory:after,stability}=inventoryStableDataTree(root,dayKey,scanOptions);
  check(stability.ok && stability.writerQuiescenceAttested===false,
    "stage20_observation_stability_not_proven");
  const delta=compareDataInventories(before,after);
  atomicEvidence(afterFile,after,tempRoot);
  atomicEvidence(deltaFile,delta,tempRoot);
  return {
    schema:STAGE20_OBSERVATION_SCHEMA,phase:"post",dayKey,
    sourceCommit:after.sourceCommit,beforeSha256:before.manifestSha256,
    afterSha256:after.manifestSha256,
    beforeFiles:before.fileCount,afterFiles:after.fileCount,
    added:delta.added,modified:delta.modified,deleted:delta.deleted,
    sourceHashConsistent:true,ignoredIncluded:true,
    consecutiveVerifiedPasses:stability.consecutivePasses,writerQuiescenceAttested:false,
    stageCaptureAuthorized:false,resumeAuthorized:false,
    publicationAuthorized:false
  };
}

// Failure-only observation is a different evidence class. A terminated/failed
// Daily cycle never becomes an accepted Stage20 completion checkpoint.
export function observeStage20FailedCycle(root,dayKey,tempRoot,scanOptions={}) {
  check(DAY.test(dayKey),"stage20_observation_day_invalid");
  const beforeFile=runnerOutput(tempRoot,"aiml-stage20-pre.json");
  const failedPostFile=runnerOutput(tempRoot,"aiml-stage20-failure-post.json");
  const failedDeltaFile=runnerOutput(tempRoot,"aiml-stage20-failure-delta.json");
  check(fs.existsSync(beforeFile) && !fs.lstatSync(beforeFile).isSymbolicLink(),
    "stage20_failed_cycle_pre_missing");
  check(!fs.existsSync(failedPostFile) && !fs.existsSync(failedDeltaFile),
    "stage20_observation_evidence_exists");
  // An ordinary successful post-stage attestation and a failure attestation
  // are mutually exclusive for one runner attempt.
  check(!fs.existsSync(runnerOutput(tempRoot,"aiml-stage20-post.json")) &&
    !fs.existsSync(runnerOutput(tempRoot,"aiml-stage20-delta.json")),
    "stage20_failed_cycle_success_evidence_conflict");
  const before=JSON.parse(fs.readFileSync(beforeFile,"utf8"));
  check(verifyDataInventory(before).ok && before.dayKey===dayKey,
    "stage20_failed_cycle_pre_invalid");
  const {inventory:after,stability}=inventoryStableDataTree(root,dayKey,scanOptions);
  check(stability.ok && stability.writerQuiescenceAttested===false,
    "stage20_failed_cycle_stability_invalid");
  const delta=compareDataInventories(before,after);
  atomicEvidence(failedPostFile,after,tempRoot);
  atomicEvidence(failedDeltaFile,{
    ...delta,stageComplete:false,cycleOutcome:"failure",
    resumable:false,publicationAuthorized:false
  },tempRoot);
  return {
    schema:STAGE20_OBSERVATION_SCHEMA,phase:"failed-cycle",dayKey,
    cycleOutcome:"failure",stageComplete:false,
    beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,
    beforeFiles:before.fileCount,afterFiles:after.fileCount,
    added:delta.added,modified:delta.modified,deleted:delta.deleted,
    ignoredIncluded:true,consecutiveVerifiedPasses:2,
    writerQuiescenceAttested:false,
    stageCaptureAuthorized:false,resumeAuthorized:false,
    publicationAuthorized:false
  };
}

const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    const [phase,day]=process.argv.slice(2);
    check(process.argv.length===4 && ["pre","post","failed-post"].includes(phase),
      "stage20_observation_usage_pre_post_or_failed_post_day");
    const temp=process.env.RUNNER_TEMP;
    const report=phase==="pre"?observeStage20Pre(process.cwd(),day,temp):
      phase==="post"?observeStage20Post(process.cwd(),day,temp):
      observeStage20FailedCycle(process.cwd(),day,temp);
    console.log("STAGE20_BOUNDARY_OBSERVATION="+JSON.stringify(report));
  }catch(e){console.error("STAGE20_BOUNDARY_OBSERVATION_DENIED="+String(e.message||e));process.exitCode=1;}
}
