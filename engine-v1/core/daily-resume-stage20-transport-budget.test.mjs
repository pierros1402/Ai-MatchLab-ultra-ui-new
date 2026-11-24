import test from "node:test";
import assert from "node:assert/strict";
import {inspectStage20TransportBudget as inspect} from "./daily-resume-stage20-transport-budget.mjs";
const commit="a".repeat(40);
const base={physicalDataFiles:145428,physicalDataBytes:5067819139,
  deltaPaths:10,deltaWriteBytes:100000,ignoredDataFiles:0,
  unaccountedDataFiles:0,producerCommit:commit};
test("realistic 5GB committed tree can fit a small delta without granting checkpoint",()=>{
  const r=inspect(base);
  assert.equal(r.budgetEligible,true);
  assert.equal(r.physicalDataFiles,145428);
  assert.equal(r.completeCheckpointProven,false);
  assert.equal(r.resumeAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
});
test("more than 10000 paths is denied",()=>{
  const r=inspect({...base,deltaPaths:10001});
  assert.equal(r.reason,"stage20_transport_path_budget_exceeded");
});
test("more than 512MiB written delta is denied, not full tree size",()=>{
  assert.equal(inspect({...base,deltaWriteBytes:512*1024*1024+1}).reason,
    "stage20_transport_byte_budget_exceeded");
  assert.equal(inspect({...base,deltaWriteBytes:512*1024*1024}).budgetEligible,true);
});
test("ignored data never goes missing silently",()=>{
  assert.equal(inspect({...base,ignoredDataFiles:1}).reason,
    "stage20_transport_missing_physical_data");
});
test("unaccounted physical data denies reuse",()=>{
  assert.equal(inspect({...base,unaccountedDataFiles:1}).budgetEligible,false);
});
test("untrusted metrics or commit are denied",()=>{
  for(const patch of [{physicalDataFiles:-1},{physicalDataBytes:NaN},
    {producerCommit:"bad"},{deltaWriteBytes:Infinity},
    {physicalDataFiles:0},{deltaPaths:0}])
    assert.equal(inspect({...base,...patch}).reason,"stage20_transport_evidence_invalid");
});
test("large exact-boundary delta returns only eligibility evidence",()=>{
  const r=inspect({...base,deltaPaths:10000,deltaWriteBytes:512*1024*1024});
  assert.equal(r.budgetEligible,true);
  assert.equal(r.sourceContentVerified,false);
  assert.equal(r.stageCompleteVerified,false);
  assert.equal(r.writerQuiescenceAttested,false);
});

test("valid physical tombstones can outnumber surviving post-tree files",()=>{
  const r=inspect({...base,physicalDataFiles:2,physicalDataBytes:5,
    deltaPaths:10,deltaWriteBytes:3});
  assert.equal(r.budgetEligible,true);
  assert.equal(r.deltaPaths,10);
  assert.equal(r.completeCheckpointProven,false);
  assert.equal(r.resumeAuthorized,false);
});
test("tombstone-heavy delta still enforces the 10000 path transport cap",()=>{
  const r=inspect({...base,physicalDataFiles:2,physicalDataBytes:5,
    deltaPaths:10001,deltaWriteBytes:3});
  assert.equal(r.budgetEligible,false);
  assert.equal(r.reason,"stage20_transport_path_budget_exceeded");
});
test("impossible byte count remains denied even with many deletion tombstones",()=>{
  const r=inspect({...base,physicalDataFiles:2,physicalDataBytes:5,
    deltaPaths:10,deltaWriteBytes:6});
  assert.equal(r.reason,"stage20_transport_evidence_invalid");
});
