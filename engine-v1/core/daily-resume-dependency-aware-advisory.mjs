// Advisory only: dependency-scoped reuse proposals with mandatory downstream
// gates. Does NOT launch, skip or publish real Daily stages.
import {validateGraph,verifyCheckpoint} from "./daily-resume-contract.mjs";
import {auditInvocationCoverage} from "./daily-resume-invocation-coverage-advisory.mjs";
export const DAG_ADVISORY_SCHEMA="ai-matchlab.daily-dependency-aware-advisory.v1";
export const MANDATORY_RUN_IDS=Object.freeze([
  "daily-cycle","live-status-refresh","prepublish-gate","commit-snapshot","public-verify"
]);
const POLICY_TYPES=new Set(["frozen","derived","external","mutable","gate"]);
function check(ok,code){if(!ok)throw Error(code);}
function policy(stage) {
  check(stage && POLICY_TYPES.has(stage.reuseClass),"dag_reuse_policy_missing");
  check(!MANDATORY_RUN_IDS.includes(stage.id) || stage.reuseClass!=="frozen",
    "dag_mandatory_stage_false_frozen");
}
export function planDependencyAwareDailyRecovery(stages,binding,checkpoints={}) {
  validateGraph(stages);
  check(binding && typeof binding==="object" &&
    checkpoints && typeof checkpoints==="object" && !Array.isArray(checkpoints),
    "dag_advisory_inputs_invalid");
  for(const stage of stages)policy(stage);
  const verified=new Map();
  const planned=new Map();
  const decisions=[];
  for(const stage of stages) {
    const dependencies=stage.dependsOn||[];
    const invalidDependencies=dependencies.filter(id=>!verified.has(id));
    let reason=null,evidenceSha256=null;
    if(MANDATORY_RUN_IDS.includes(stage.id) || stage.reuseClass==="gate")
      reason="mandatory_stage_must_run";
    else if(stage.reuseClass==="external" || stage.reuseClass==="mutable")
      reason="volatile_source_must_refresh";
    else if(stage.reuseClass==="derived")
      reason="derived_reuse_not_yet_authorized";
    else if(invalidDependencies.length)
      reason="upstream_stage_not_reusable";
    else {
      const deps=Object.fromEntries(dependencies.map(id=>[id,verified.get(id)]));
      const checked=verifyCheckpoint(stage,binding,checkpoints[stage.id],deps);
      if(checked.reusable) {
        verified.set(stage.id,checked.evidenceSha256);
        evidenceSha256=checked.evidenceSha256;
      }else reason=checked.reason||"checkpoint_invalid";
    }
    const decision=reason?"RUN":"REUSE_VERIFIED_ADVISORY";
    const row={
      stageId:stage.id,reuseClass:stage.reuseClass,
      dependsOn:[...dependencies],
      invalidDependencies,decision,reason,
      evidenceSha256
    };
    decisions.push(row);
    planned.set(stage.id,row);
  }
  const firstToRerun=decisions.find(x=>x.decision==="RUN")?.stageId||null;
  const unsafeSkipped=decisions.filter(x=>MANDATORY_RUN_IDS.includes(x.stageId) &&
    x.decision!=="RUN");
  check(unsafeSkipped.length===0,"dag_mandatory_stage_skipped");
  return {
    schema:DAG_ADVISORY_SCHEMA,dayKey:binding.dayKey,
    firstToRerun,verifiedFrozenStages:verified.size,
    runStages:decisions.filter(x=>x.decision==="RUN").length,
    decisions,
    dependencyScoped:true,
    mandatoryPublicationGatesRerun:true,
    actualStageSkipAuthorized:false,
    productionResumeAuthorized:false,
    publicationAuthorized:false
  };
}

// Production-facing advisory composition. Never treats a caller-declared
// inventory or a marker-only observation as independently verified coverage.
// Existing generic checkpoint planner remains available for isolated callers.
export function planInvocationBoundDailyRecovery({stages,binding,checkpoints={},invocations}={}) {
  validateGraph(stages);
  check(binding && typeof binding==="object","dag_advisory_inputs_invalid");
  for(const stage of stages)policy(stage);
  check(MANDATORY_RUN_IDS.every(id=>stages.some(s=>s.id===id)),
    "dag_mandatory_stage_missing");
  const coverage=auditInvocationCoverage(invocations);
  // Current invocation contract has no trusted receipt or exhaustive scope
  // proof. Even an exact declared match cannot unlock checkpoint reuse.
  const reason=!coverage.accepted?"invocation_coverage_rejected":
    !coverage.declaredInventoryMatched?"invocation_coverage_incomplete":
    "invocation_coverage_not_independently_verified";
  const plan=planDependencyAwareDailyRecovery(stages,binding,{});
  return {...plan,
    schema:"ai-matchlab.daily-invocation-bound-recovery-advisory.v1",
    invocationCoverage:coverage,
    coverageBlockReason:reason,
    checkpointReuseBlocked:true,
    suppliedCheckpointsIgnored:true,
    decisions:plan.decisions.map(row=>({...row,decision:"RUN",
      reason:row.reuseClass==="frozen"?reason:row.reason,evidenceSha256:null})),
    verifiedFrozenStages:0,runStages:stages.length,
    firstToRerun:stages[0].id,
    actualStageSkipAuthorized:false,productionResumeAuthorized:false,
    publicationAuthorized:false};
}
