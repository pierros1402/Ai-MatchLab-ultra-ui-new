import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {evaluateStage20CompletionEvidence as admit} from "./daily-resume-stage20-completion-evidence.mjs";
import {COMPLETE_DATA_INVENTORY_SCHEMA} from "./daily-resume-complete-data-inventory.mjs";
import {STAGE20_TRANSPORT_BUDGET_SCHEMA} from "./daily-resume-stage20-transport-budget.mjs";
import {STAGE20_REPLAY_PARITY_SCHEMA} from "./daily-resume-stage20-replay-parity.mjs";
const hash=o=>crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const commit="a".repeat(40),dayKey="2026-11-24";
const makeInventory=(rows)=>{
  const files=rows.map(([path,bytes,value])=>({path,bytes,sha256:hash(value)}));
  const body={schema:COMPLETE_DATA_INVENTORY_SCHEMA,dayKey,sourceCommit:commit,
    root:"data/",fileCount:files.length,totalBytes:files.reduce((s,x)=>s+x.bytes,0),
    files,includesIgnored:true,includesUntracked:true,includesTracked:true,
    stageCaptureAuthorized:false,resumeAuthorized:false,publicationAuthorized:false};
  return {...body,manifestSha256:hash(body)};
};
const pre=makeInventory([["data/value/a.json",2,"a"]]);
const post=makeInventory([["data/value/a.json",2,"b"],["data/value/new.json",3,"c"]]);
const make=()=>({
  dayKey,producerCommit:commit,runId:"45137286904",runAttempt:1,
  cycle:{stageId:"daily-cycle",dayKey,producerCommit:commit,
    runId:"45137286904",runAttempt:1,status:"completed",exitCode:0,
    signal:null,stageComplete:true},
  preInventory:pre,postInventory:post,
  transport:{schema:STAGE20_TRANSPORT_BUDGET_SCHEMA,budgetEligible:true,
    producerCommit:commit,physicalDataFiles:2,physicalDataBytes:5,
    deltaPaths:2,deltaWriteBytes:5,ignoredDataFiles:0,unaccountedDataFiles:0,
    completeCheckpointProven:false,resumeAuthorized:false,publicationAuthorized:false},
  parity:{schema:STAGE20_REPLAY_PARITY_SCHEMA,ok:true,dayKey,
    baseCommit:commit,fileCount:2,totalBytes:5,
    fullTreeInventorySha256:post.manifestSha256,
    checkpointSha256:"f".repeat(64),
    sandboxReplayVerified:true,ignoredIncluded:true,
    writerQuiescenceAttested:false,stageCompleteVerified:false,
    resumeAuthorized:false,publicationAuthorized:false}
});
test("all bound source evidence qualifies ONLY for evidence inspection",()=>{
  const r=admit(make());
  assert.equal(r.evidenceQualified,true);
  assert.equal(r.changedPaths,2);
  assert.equal(r.checkpointReusable,false);
  assert.equal(r.stageCodeCompatibilityVerified,false);
  assert.equal(r.dependencyDAGVerified,false);
  assert.equal(r.resumeAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
});
test("failed cycle cannot masquerade as completed stage",()=>{
  const a=make();a.cycle.exitCode=1;
  assert.equal(admit(a).reason,"stage20_completion_cycle_unproven");
});
test("interrupted or pending cycle denies checkpoint",()=>{
  for(const patch of [{signal:"SIGTERM"},{status:"in_progress"},{stageComplete:false}]){
    const a=make();Object.assign(a.cycle,patch);
    assert.equal(admit(a).evidenceQualified,false);
  }
});
test("a tampered pre or post inventory denies completion",()=>{
  const a=make();a.postInventory={...post,totalBytes:8};
  assert.equal(admit(a).reason,"stage20_completion_inventory_unverified");
});
test("wrong source commit/day/attempt denies",()=>{
  for(const patch of [{producerCommit:"b".repeat(40)},{dayKey:"2026-11-23"},{runAttempt:2}]){
    const a=make();Object.assign(a,patch);
    assert.equal(admit(a).evidenceQualified,false);
  }
});
test("unrecorded output paths or transport byte count rejects binding",()=>{
  for(const patch of [{deltaPaths:1},{physicalDataFiles:3},
    {physicalDataBytes:10},{ignoredDataFiles:1},{unaccountedDataFiles:1},
    {budgetEligible:false}]){
    const a=make();Object.assign(a.transport,patch);
    assert.equal(admit(a).reason,"stage20_completion_transport_unbound");
  }
});
test("parity mismatch or unverified sandbox denies",()=>{
  for(const patch of [{fullTreeInventorySha256:"b".repeat(64)},
    {checkpointSha256:"bad"},{sandboxReplayVerified:false},
    {stageCompleteVerified:true},{publicationAuthorized:true}]){
    const a=make();Object.assign(a.parity,patch);
    assert.equal(admit(a).reason,"stage20_completion_parity_unbound");
  }
});
test("missing evidence and malformed run id deny",()=>{
  assert.equal(admit({}).evidenceQualified,false);
  assert.equal(admit({...make(),runId:"0"}).evidenceQualified,false);
});
