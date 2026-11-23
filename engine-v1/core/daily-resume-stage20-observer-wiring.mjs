// Pure source audit for optional read-only Stage20 boundary observers.
// Never authorizes enablement, skip, checkpoint upload, or publication.
const PRE="Shadow read-only Stage20 pre-cycle data inventory (default OFF)";
const CYCLE="Run daily cycle";
const POST="Shadow read-only Stage20 post-cycle data inventory (default OFF)";
const MARKER="Shadow capture verified stage-20 worktree delta (opt-in only)";
const FLAG="vars.AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED == '1'";
function check(ok,reason){if(!ok)throw Error(reason);}
function step(text,name) {
  const needle="      - name: "+name;
  const at=text.indexOf(needle);
  check(at>=0 && text.indexOf(needle,at+1)<0,"stage20_observer_step_missing_or_duplicate:"+name);
  const next=text.indexOf("\n      - name:",at+needle.length);
  return {at,body:text.slice(at,next<0?text.length:next)};
}
export function auditStage20ObserverWiring(workflow) {
  check(typeof workflow==="string","stage20_observer_workflow_missing");
  const before=step(workflow,PRE),cycle=step(workflow,CYCLE),
    after=step(workflow,POST),old=step(workflow,MARKER);
  check(before.at<cycle.at && cycle.at<after.at && after.at<old.at,
    "stage20_observer_wrong_boundary_order");
  for(const entry of [before,after]){
    check(entry.body.includes(FLAG) &&
      entry.body.includes("env.SKIP_BUILD != 'true'") &&
      entry.body.includes("continue-on-error: true") &&
      entry.body.includes("set -euo pipefail") &&
      !entry.body.includes("actions/upload-artifact") &&
      !entry.body.includes("resumeFrom") &&
      !entry.body.includes("git push") &&
      !entry.body.includes("always()") &&
      !entry.body.includes("|| true"),
      "stage20_observer_fail_closed_guard_missing");
  }
  check(before.body.includes("id: shadow_stage20_pre") &&
    before.body.includes('observe-stage20-data-inventory.mjs pre "$DAY_KEY"'),
    "stage20_observer_pre_binding_invalid");
  check(after.body.includes("id: shadow_stage20_post") &&
    after.body.includes("steps.shadow_stage20_pre.outcome == 'success'") &&
    after.body.includes('observe-stage20-data-inventory.mjs post "$DAY_KEY"'),
    "stage20_observer_post_binding_invalid");
  check(!cycle.body.includes("continue-on-error: true") &&
    cycle.body.includes('node ./engine-v1/jobs/run-daily-cycle.js "$DAY_KEY"'),
    "stage20_observer_cycle_failure_not_propagated");
  return {schema:"ai-matchlab.stage20-boundary-observer-wiring.v1",
    boundaryOrder:["pre","cycle","post","existing-shadow-capture"],
    defaultOff:true,nonBlockingObserver:true,
    sourceBound:true,productionResumeAuthorized:false,
    publicationAuthorized:false};
}
