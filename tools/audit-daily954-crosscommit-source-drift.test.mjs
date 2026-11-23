import test from "node:test";
import assert from "node:assert/strict";
import {summarizeHistoricalSourceDrift} from "./audit-daily954-crosscommit-source-drift.mjs";
test("source and data drift are classified but never authorize cross-commit resume",()=>{
  const r=summarizeHistoricalSourceDrift([
    {status:"M",path:"engine-v1/jobs/settle-plan-c-shadow.js"},
    {status:"A",path:"data/value/2026-11-23.json"},
    {status:"M",path:"tools/audit.js"}
  ]);
  assert.equal(r.sourceAndControlPathsChanged,2);
  assert.equal(r.dataPathsChanged,1);
  assert.equal(r.criticalEntrypointsChanged.length,1);
  assert.equal(r.crossCommitResumeAuthorized,false);
  assert.equal(r.stageScopedTransitiveClosureVerified,false);
});
test("even zero changed paths cannot authorize skipped dependencies",()=>{
  const r=summarizeHistoricalSourceDrift([]);
  assert.equal(r.totalChanged,0);
  assert.equal(r.crossCommitResumeAuthorized,false);
});
test("unknown status denied",()=>assert.throws(()=>summarizeHistoricalSourceDrift([
  {status:"R100",path:"engine-v1/a.js"}]),/crosscommit_diff_row_invalid/));
test("duplicate paths denied",()=>assert.throws(()=>summarizeHistoricalSourceDrift([
  {status:"M",path:"engine-v1/a.js"},{status:"A",path:"engine-v1/a.js"}
]),/crosscommit_diff_row_invalid/));
test("traversal and windows-style paths denied",()=>{
  for(const name of ["../outside.js","engine-v1\\bad.js","/tmp/file","data/./x.json"])
    assert.throws(()=>summarizeHistoricalSourceDrift([{status:"M",path:name}]),/crosscommit_diff_row_invalid/);
});
test("critical Daily entrypoints identified exactly",()=>{
  const r=summarizeHistoricalSourceDrift([
    {status:"M",path:".github/workflows/daily-deploy-snapshot.yml"},
    {status:"M",path:"engine-v1/jobs/run-daily-cycle.js"},
    {status:"M",path:"engine-v1/jobs/build-details-day.js"}
  ]);
  assert.equal(r.criticalEntrypointsChanged.length,3);
  assert.equal(r.publicationAuthorized,false);
});
