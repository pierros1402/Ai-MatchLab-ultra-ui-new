import test from "node:test";
import assert from "node:assert/strict";
import {auditStage20CommittedScope as audit} from "./daily-resume-stage20-committed-scope-audit.mjs";
const COMMIT="a".repeat(40),DAY="2026-11-24";
test("real Stage20 policy accepts known data families and denies nonallowlisted families",()=>{
  const paths=["data/canonical-fixtures/2026-11-24/day.json",
    "data/league-memory/day.json","data/research-cache/item.json",
    "data/value/2026-11-24.json"];
  const x=audit(paths,DAY,COMMIT);
  assert.equal(x.trackedPathCount,4);
  assert.equal(x.admitted,2);
  assert.equal(x.denied,2);
  assert.equal(x.deniedKnownFamilies["league-memory"].denied,1);
  assert.equal(x.deniedKnownFamilies["research-cache"].denied,1);
  assert.equal(x.gitTrackedOnly,true);
  assert.equal(x.ignoredRuntimeFilesInspected,false);
  assert.equal(x.completeCheckpointProven,false);
  assert.equal(x.resumeAuthorized,false);
});
test("unsafe unknown extension remains denied without source names in result",()=>{
  const x=audit(["data/value/2026-11-24.bin"],DAY,COMMIT);
  assert.equal(x.denied,1);
  assert.equal(x.deniedUnsupportedExtension,1);
  assert.equal(JSON.stringify(x).includes("2026-11-24.bin"),false);
});
test("duplicates and unsorted paths fail closed",()=>{
  assert.throws(()=>audit(["data/value/a.json","data/value/a.json"],DAY,COMMIT),
    /stage20_committed_scope_path_invalid/);
  assert.throws(()=>audit(["data/value/z.json","data/value/a.json"],DAY,COMMIT),
    /stage20_committed_scope_path_invalid/);
});
test("traversal and backslash paths fail closed",()=>{
  assert.throws(()=>audit(["data/value/../secret.json"],DAY,COMMIT),
    /stage20_committed_scope_path_invalid/);
  assert.throws(()=>audit(["data\\value\\file.json"],DAY,COMMIT),
    /stage20_committed_scope_path_invalid/);
});
test("wrong source or no complete input list denies",()=>{
  assert.throws(()=>audit([],DAY,COMMIT),/stage20_committed_scope_binding_invalid/);
  assert.throws(()=>audit(["data/value/a.json"],DAY,"untrusted"),/stage20_committed_scope_binding_invalid/);
});
test("full tracked set digest changes on added path",()=>{
  const p=["data/value/a.json"];
  const x=audit(p,DAY,COMMIT);
  const y=audit([...p,"data/value/b.json"],DAY,COMMIT);
  assert.notEqual(x.trackedPathSetSha256,y.trackedPathSetSha256);
  assert.equal(y.resumeAuthorized,false);
});
