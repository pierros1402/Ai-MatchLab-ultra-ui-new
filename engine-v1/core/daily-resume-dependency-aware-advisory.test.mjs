import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {digest,createCheckpoint} from "./daily-resume-contract.mjs";
import {planDependencyAwareDailyRecovery} from "./daily-resume-dependency-aware-advisory.mjs";
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-dag-advisory-"));
  try {
    for(const file of ["feed","a","b","child","derived","gate"])
      fs.writeFileSync(path.join(root,file),file+"\n");
    const binding={
      root,dayKey:"2026-11-23",producerCommit:"a".repeat(40),
      contractSha256:digest("pinned stage contracts")
    };
    const stages=[
      {id:"frozen-a",dependsOn:[],inputs:["feed"],outputs:["a"],reuseClass:"frozen"},
      {id:"frozen-b",dependsOn:[],inputs:["feed"],outputs:["b"],reuseClass:"frozen"},
      {id:"frozen-child",dependsOn:["frozen-a"],inputs:["a"],outputs:["child"],reuseClass:"frozen"},
      {id:"daily-cycle",dependsOn:["frozen-child","frozen-b"],inputs:["child"],outputs:["derived"],reuseClass:"mutable"},
      {id:"prepublish-gate",dependsOn:["daily-cycle"],inputs:["derived"],outputs:["gate"],reuseClass:"gate"},
      {id:"public-verify",dependsOn:["prepublish-gate"],inputs:["gate"],outputs:["feed"],reuseClass:"gate"}
    ];
    const a=createCheckpoint(stages[0],binding);
    const b=createCheckpoint(stages[1],binding);
    const child=createCheckpoint(stages[2],binding,{"frozen-a":a.evidenceSha256});
    const checkpoints={"frozen-a":a,"frozen-b":b,"frozen-child":child};
    fn({root,binding,stages,checkpoints});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
const decisions=result=>Object.fromEntries(result.decisions.map(x=>[x.stageId,x]));
test("independent verified frozen nodes reuse while expensive cycle and publish gates rerun",()=>fixture(f=>{
  const r=planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints);
  const d=decisions(r);
  assert.equal(d["frozen-a"].decision,"REUSE_VERIFIED_ADVISORY");
  assert.equal(d["frozen-b"].decision,"REUSE_VERIFIED_ADVISORY");
  assert.equal(d["frozen-child"].decision,"REUSE_VERIFIED_ADVISORY");
  assert.equal(d["daily-cycle"].decision,"RUN");
  assert.equal(d["prepublish-gate"].decision,"RUN");
  assert.equal(d["public-verify"].decision,"RUN");
  assert.equal(r.actualStageSkipAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
}));
test("one corrupt branch invalidates dependents, not sibling frozen branch",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.root,"a"),"tampered");
  const r=planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints);
  const d=decisions(r);
  assert.equal(d["frozen-a"].decision,"RUN");
  assert.equal(d["frozen-b"].decision,"REUSE_VERIFIED_ADVISORY");
  assert.equal(d["frozen-child"].reason,"upstream_stage_not_reusable");
  assert.equal(r.firstToRerun,"frozen-a");
}));
test("missing upstream checkpoint invalidates only its descendants",()=>fixture(f=>{
  delete f.checkpoints["frozen-a"];
  const d=decisions(planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints));
  assert.equal(d["frozen-a"].decision,"RUN");
  assert.equal(d["frozen-b"].decision,"REUSE_VERIFIED_ADVISORY");
  assert.equal(d["frozen-child"].decision,"RUN");
}));
test("contract SHA mismatch rejects all would-be frozen reuse",()=>fixture(f=>{
  f.binding.contractSha256=digest("different");
  const r=planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints);
  assert.equal(r.verifiedFrozenStages,0);
}));
test("source SHA mismatch rejects all would-be frozen reuse",()=>fixture(f=>{
  f.binding.producerCommit="b".repeat(40);
  assert.equal(planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints).verifiedFrozenStages,0);
}));
test("external freshness stages always rerun even if checkpoint looks valid",()=>fixture(f=>{
  f.stages[1]={...f.stages[1],reuseClass:"external"};
  const d=decisions(planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints));
  assert.equal(d["frozen-b"].reason,"volatile_source_must_refresh");
}));
test("derived checkpoints are never assumed safe",()=>fixture(f=>{
  f.stages[2]={...f.stages[2],reuseClass:"derived"};
  const d=decisions(planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints));
  assert.equal(d["frozen-child"].reason,"derived_reuse_not_yet_authorized");
}));
test("lying about mandatory stage as frozen is rejected",()=>fixture(f=>{
  f.stages[3]={...f.stages[3],reuseClass:"frozen"};
  assert.throws(()=>planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints),
    /dag_mandatory_stage_false_frozen/);
}));
test("unknown reuse policy fails closed",()=>fixture(f=>{
  delete f.stages[0].reuseClass;
  assert.throws(()=>planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints),
    /dag_reuse_policy_missing/);
}));
test("forward dependency and unsupported graph rejected",()=>fixture(f=>{
  f.stages[0]={...f.stages[0],dependsOn:["public-verify"]};
  assert.throws(()=>planDependencyAwareDailyRecovery(f.stages,f.binding,f.checkpoints),
    /resume_dependency_order_invalid/);
}));
