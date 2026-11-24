import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {auditStage20CommittedDelta as audit} from "./daily-resume-stage20-committed-delta-audit.mjs";
const git=(r,...a)=>execFileSync("git",a,{cwd:r,encoding:"utf8"}).trim();
const DAY="2026-11-24";
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-committed-delta-"));
  try{
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","Fixture");
    git(root,"config","user.email","fixture@example.invalid");
    const write=(p,v)=>{
      const file=path.join(root,p);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,v);
    };
    write("data/value/2026-11-24.json","original");
    write("data/foundation-integrity/2026-11-24.json","original");
    write("data/value/obsolete.json","remove");
    git(root,"add",".");git(root,"commit","-qm","base");
    const baseCommit=git(root,"rev-parse","HEAD");
    write("data/value/2026-11-24.json","new");
    write("data/foundation-integrity/2026-11-24.json","new");
    fs.unlinkSync(path.join(root,"data/value/obsolete.json"));
    write("data/value/new.json","added");
    git(root,"add","-A");git(root,"commit","-qm","fixture-run");
    const targetCommit=git(root,"rev-parse","HEAD");
    fn({root,baseCommit,targetCommit,dayKey:DAY,write});
  }finally{fs.rmSync(root,{recursive:true,force:true})}
}
test("exact committed changes, deletions and policy-denied families are classified",()=>fixture(f=>{
  const a=audit({...f,repoRoot:f.root});
  assert.equal(a.accepted,true);
  assert.equal(a.changedDataPaths,4);
  assert.equal(a.policyAdmitted,3);
  assert.equal(a.policyDenied,1);
  assert.equal(a.modified,2);
  assert.equal(a.added,1);
  assert.equal(a.deleted,1);
  assert.equal(a.deniedFamilyCounts["foundation-integrity"],1);
  assert.match(a.exactChangedPathSetSha256,/^[a-f0-9]{64}$/);
  assert.equal(a.completeStage20Payload,false);
  assert.equal(a.resumeAuthorized,false);
  assert.equal(a.publicationAuthorized,false);
}));
test("reverse or unrelated commit ancestry is denied",()=>fixture(f=>{
  const a=audit({...f,repoRoot:f.root,
    baseCommit:f.targetCommit,targetCommit:f.baseCommit});
  assert.equal(a.accepted,false);
}));
test("same commit is not a checkpoint delta",()=>fixture(f=>{
  const a=audit({...f,repoRoot:f.root,targetCommit:f.baseCommit});
  assert.equal(a.reason,"stage20_committed_delta_binding_invalid");
}));
test("unknown source hash fails closed",()=>fixture(f=>{
  const a=audit({...f,repoRoot:f.root,baseCommit:"0".repeat(40)});
  assert.equal(a.accepted,false);
}));
test("uncommitted runner outputs are never mistaken for committed delta",()=>fixture(f=>{
  const before=audit({...f,repoRoot:f.root});
  f.write("data/value/runner-untracked.json","not committed");
  const after=audit({...f,repoRoot:f.root});
  assert.equal(after.changedDataPaths,before.changedDataPaths);
  assert.equal(after.exactChangedPathSetSha256,before.exactChangedPathSetSha256);
  assert.equal(after.untrackedRuntimeFilesVerified,false);
}));
test("non-data-only commit has no admissible Stage20 data delta",()=>fixture(f=>{
  f.write("engine-v1/core/producer.js","changed source");
  git(f.root,"add","-A");git(f.root,"commit","-qm","source-only");
  const next=git(f.root,"rev-parse","HEAD");
  const out=audit({...f,repoRoot:f.root,baseCommit:f.targetCommit,targetCommit:next});
  assert.equal(out.accepted,false);
  assert.equal(out.reason,"stage20_committed_delta_nondata_source_changed");
}));

test("mixed code+data changes cannot be classified as source-equivalent committed delta",()=>fixture(f=>{
  f.write("engine-v1/core/producer.js","source changed");
  f.write("data/value/new.json","data changed again");
  git(f.root,"add","-A");git(f.root,"commit","-qm","mixed code and data");
  const target=git(f.root,"rev-parse","HEAD");
  const out=audit({...f,repoRoot:f.root,targetCommit:target});
  assert.equal(out.accepted,false);
  assert.equal(out.reason,"stage20_committed_delta_nondata_source_changed");
  assert.equal(out.resumeAuthorized,false);
}));
