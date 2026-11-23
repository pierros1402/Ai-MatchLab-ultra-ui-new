import test from "node:test";
import assert from "node:assert/strict";
import {aggregateResidualRows,classifyResidualFamily} from "./audit-stage20-residual-548.mjs";
test("approved and unknown family paths remain segregated and cannot authorize omission",()=>{
  const x=aggregateResidualRows([
    {path:"data/value/2026-11-23.json",bytes:10},
    {path:"data/research-cache/persisted.json",bytes:9},
    {path:"data/odds-memory/fixture.json",bytes:13}
  ],"2026-11-23");
  assert.deepEqual([x.admitted,x.denied,x.deniedBytes],[1,2,22]);
  assert.equal(x.excludedFilesApprovedForOmission,0);
  assert.equal(x.omissionAuthorized,false);
  assert.equal(x.resumeAuthorized,false);
});
test("unknown excluded family is not silently qualified",()=>{
  const x=aggregateResidualRows([{path:"data/new-identity-secret/x.json",bytes:1}],"2026-11-23");
  assert.equal(x.denied,1);
  assert.equal(x.unclassified,1);
});
test("canonical source and conflict categories require explicit lineage",()=>{
  assert.equal(classifyResidualFamily("data/canonical-registry"),"canonical-identity-needs-retention-proof");
  assert.equal(classifyResidualFamily("data/final-result-conflicts"),"truth-conflict-needs-immutable-guard");
});
test("path traversal, duplicate and bad bytes deny aggregation",()=>{
  for(const bad of [
    [{path:"data/../secrets.json",bytes:1}],
    [{path:"data/research-cache/x.json",bytes:-1}],
    [{path:"data/research-cache/x.json",bytes:1},{path:"data/research-cache/x.json",bytes:1}]
  ])assert.throws(()=>aggregateResidualRows(bad,"2026-11-23"),/stage20_residual_row_invalid/);
});
test("classification never infers that caches can be discarded",()=>{
  const x=aggregateResidualRows([{path:"data/research-cache/x.json",bytes:20}],"2026-11-23");
  assert.equal(x.sourceLineageComplete,false);
  assert.equal(x.omissionAuthorized,false);
  assert.equal(x.checkpointCompletenessProven,false);
});
