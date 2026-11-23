// Isolated execution proof of a stage DAG, NOT a production Daily adapter.
// Fail-closed: only authenticated source/contract/input/output bytes may skip.
// Any invalid stage forces a suffix rebuild; gates and volatile inputs always run.
import fs from "node:fs";
import path from "node:path";
import {validateGraph,verifyCheckpoint} from "./daily-resume-contract.mjs";
import {archiveStage,verifyArchive} from "./daily-resume-artifact-store.mjs";
const CLASSES=new Set(["frozen","derived","external","mutable","gate"]);
const MANDATORY=new Set(["prepublish-gate","commit-snapshot","public-verify"]);
function requireThat(ok,reason){if(!ok)throw Error(reason);}
export async function runSandboxRecoveryDAG({
  stages,binding,previousCheckpoints={},storeRoot,runStage,sandboxAuthorized=false,sandboxRoot
}={}){
  requireThat(sandboxAuthorized===true,"sandbox_execution_not_authorized");
  requireThat(typeof sandboxRoot==="string"&&fs.existsSync(sandboxRoot),"sandbox_root_required");
  const base=fs.realpathSync(sandboxRoot);
  function inside(p){return typeof p==="string"&&path.resolve(p).startsWith(base+path.sep);}
  requireThat(inside(binding?.root)&&inside(storeRoot),"sandbox_path_outside_boundary");
  for(const target of [binding.root,storeRoot]){
    let item=base;
    for(const segment of path.relative(base,path.resolve(target)).split(path.sep)){
      item=path.join(item,segment);
      if(fs.existsSync(item))requireThat(!fs.lstatSync(item).isSymbolicLink(),"sandbox_symlink_forbidden");
    }
  }
  validateGraph(stages);
  requireThat(typeof runStage==="function"&&typeof storeRoot==="string"&&storeRoot.length>0&&
    previousCheckpoints&&typeof previousCheckpoints==="object"&&!Array.isArray(previousCheckpoints),
    "stage_execution_arguments_invalid");
  requireThat(stages.every(s=>CLASSES.has(s.reuseClass)),"stage_execution_reuse_class_invalid");
  // No service credentials, Git push, production path, or publication adapter is
  // provided. The runner callback is test-supplied and must be sandbox-scoped.
  const verified={},decisions=[];
  let rebuildSuffix=false;
  for(const stage of stages){
    const deps=Object.fromEntries(stage.dependsOn.map(id=>[id,verified[id]]));
    const force=stage.reuseClass!=="frozen"||MANDATORY.has(stage.id);
    const prior=previousCheckpoints[stage.id];
    let checked={reusable:false,reason:"no_prior_checkpoint"};
    if(!rebuildSuffix&&!force&&prior)
      checked=verifyCheckpoint(stage,binding,prior,deps);
    const reusable=!rebuildSuffix&&!force&&checked.reusable===true;
    if(reusable){
      const verifiedArchive=verifyArchive(stage,binding,deps,storeRoot,checked.evidenceSha256);
      if(!verifiedArchive.ok){
        checked={reusable:false,reason:"archive_not_verified:"+verifiedArchive.reason};
      }
    }
    if(reusable&&checked.reusable){
      verified[stage.id]=checked.evidenceSha256;
      decisions.push({stageId:stage.id,decision:"REUSE_VERIFIED",evidenceSha256:checked.evidenceSha256});
      continue;
    }
    const reason=rebuildSuffix?"earlier_stage_rebuilt":
      force?"volatile_or_mandatory_stage":checked.reason;
    rebuildSuffix=true;
    // A stage is not complete until its physical bytes are hash-archived and
    // independently re-read. Exceptions abort immediately, never publish.
    const result=await runStage(stage,{binding,dependencies:deps,reason});
    requireThat(result?.ok===true,"sandbox_stage_failed:"+stage.id);
    const saved=archiveStage(stage,binding,deps,storeRoot);
    const verifiedArchive=verifyArchive(stage,binding,deps,storeRoot,saved.checkpoint.evidenceSha256);
    requireThat(verifiedArchive.ok,"sandbox_archive_verify_failed:"+stage.id);
    verified[stage.id]=saved.checkpoint.evidenceSha256;
    decisions.push({stageId:stage.id,decision:"EXECUTED",reason,
      evidenceSha256:saved.checkpoint.evidenceSha256});
  }
  return {
    schema:"ai-matchlab.daily-sandbox-stage-execution.v1",
    dayKey:binding.dayKey,decisions,
    resumedFrom:decisions.find(d=>d.decision==="EXECUTED")?.stageId||null,
    reusedStages:decisions.filter(d=>d.decision==="REUSE_VERIFIED").length,
    executedStages:decisions.filter(d=>d.decision==="EXECUTED").length,
    sandboxOnly:true,productionResumeAuthorized:false,publicationAuthorized:false
  };
}
