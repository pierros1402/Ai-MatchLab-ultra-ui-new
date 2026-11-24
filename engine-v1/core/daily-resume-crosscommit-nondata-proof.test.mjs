import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inspectStage20CrossCommitNonDataProof} from "./daily-resume-crosscommit-nondata-proof.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"stage20-compat-"));
  try {
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","Fixture");
    git(root,"config","user.email","fixture@example.invalid");
    fs.mkdirSync(path.join(root,"engine-v1"),{recursive:true});
    fs.mkdirSync(path.join(root,"data"),{recursive:true});
    fs.writeFileSync(path.join(root,"engine-v1/run.js"),"export const code=1;\n");
    fs.writeFileSync(path.join(root,"data/day.json"),'{"value":1}\n');
    git(root,"add",".");git(root,"commit","-qm","baseline");
    const baseline=git(root,"rev-parse","HEAD");
    fs.writeFileSync(path.join(root,"data/day.json"),'{"value":2}\n');
    git(root,"add",".");git(root,"commit","-qm","data only");
    const dataCommit=git(root,"rev-parse","HEAD");
    fs.writeFileSync(path.join(root,"engine-v1/run.js"),"export const code=2;\n");
    git(root,"add",".");git(root,"commit","-qm","code change");
    const codeCommit=git(root,"rev-parse","HEAD");
    fn({root,baseline,dataCommit,codeCommit});
  }finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test("data-only successor proves non-data byte/tree identity but never reuse",()=>fixture(x=>{
  const proof=inspectStage20CrossCommitNonDataProof(x.root,x.baseline,x.dataCommit);
  assert.equal(proof.accepted,true);
  assert.equal(proof.monotonicAncestor,true);
  assert.equal(proof.nonDataContentEqual,true);
  assert.equal(proof.dataInputsVerified,false);
  assert.equal(proof.dependencyDAGVerified,false);
  assert.equal(proof.stageCodeCompatibilityVerified,false);
  assert.equal(proof.resumeAuthorized,false);
  assert.equal(proof.publicationAuthorized,false);
}));
test("changed engine source blocks cross-commit proof",()=>fixture(x=>{
  const result=inspectStage20CrossCommitNonDataProof(x.root,x.baseline,x.codeCommit);
  assert.equal(result.accepted,false);
  assert.equal(result.reason,"stage20_crosscommit_nondata_changed");
}));
test("identical commit still does not enable resume",()=>fixture(x=>{
  const proof=inspectStage20CrossCommitNonDataProof(x.root,x.baseline,x.baseline);
  assert.equal(proof.accepted,true);
  assert.equal(proof.resumeAuthorized,false);
}));
test("nonancestor cannot be admitted even with only data edits",()=>fixture(x=>{
  git(x.root,"checkout","-q","-b","other",x.baseline);
  fs.writeFileSync(path.join(x.root,"data/day.json"),'{"other":3}\n');
  git(x.root,"add",".");git(x.root,"commit","-qm","other data path");
  const other=git(x.root,"rev-parse","HEAD");
  const result=inspectStage20CrossCommitNonDataProof(x.root,x.dataCommit,other);
  assert.equal(result.accepted,false);
  assert.equal(result.reason,"stage20_crosscommit_not_ancestor");
}));
test("invalid SHA and unknown commit fail closed",()=>fixture(x=>{
  assert.equal(inspectStage20CrossCommitNonDataProof(x.root,"bad",x.dataCommit).accepted,false);
  assert.equal(inspectStage20CrossCommitNonDataProof(x.root,"b".repeat(40),x.dataCommit).accepted,false);
}));
test("non-repository path is never accepted",()=>{
  const result=inspectStage20CrossCommitNonDataProof(os.tmpdir(),"a".repeat(40),"a".repeat(40));
  assert.equal(result.accepted,false);
  assert.equal(result.resumeAuthorized,false);
});
