import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {inspectStage20CrossCommitInputBytes as check} from "./daily-resume-crosscommit-input-bytes.mjs";
const sha=buf=>crypto.createHash("sha256").update(buf).digest("hex");
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-input-crosscommit-"));
  try{
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","Fixture");
    git(root,"config","user.email","fixture@example.invalid");
    fs.mkdirSync(path.join(root,"data"),{recursive:true});
    fs.mkdirSync(path.join(root,"engine-v1"),{recursive:true});
    fs.writeFileSync(path.join(root,"engine-v1/worker.js"),"code-1\n");
    fs.writeFileSync(path.join(root,"data/frozen.json"),'{"frozen":1}\n');
    fs.writeFileSync(path.join(root,"data/other.json"),'{"other":1}\n');
    git(root,"add",".");git(root,"commit","-qm","source");
    const producerCommit=git(root,"rev-parse","HEAD");
    const original=fs.readFileSync(path.join(root,"data/frozen.json"));
    const producerInputs=[{path:"data/frozen.json",bytes:original.length,
      sha256:sha(original),provenance:"immutable_or_bound_derived"}];
    fs.writeFileSync(path.join(root,"data/other.json"),'{"other":2}\n');
    git(root,"add",".");git(root,"commit","-qm","unrelated data");
    const consumerCommit=git(root,"rev-parse","HEAD");
    const options={repoRoot:root,producerCommit,consumerCommit,
      dayKey:"2026-11-24",stageId:"frozen-stage",
      requiredInputPaths:["data/frozen.json"],producerInputs};
    fn({root,options,producerCommit,consumerCommit});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("data-only successor preserves exact declared frozen bytes, never authorizes resume",()=>fixture(x=>{
  const a=check(x.options);
  assert.equal(a.accepted,true);
  assert.equal(a.exactDeclaredInputCount,1);
  assert.equal(a.inputBytesVerified,true);
  assert.equal(a.completeInputUniverseVerified,false);
  assert.equal(a.resumeAuthorized,false);
}));
test("changing a source-bound input rejects otherwise source-equal commits",()=>fixture(x=>{
  fs.writeFileSync(path.join(x.root,"data/frozen.json"),"changed\n");
  assert.match(check(x.options).reason,/stage20_input_bytes_changed/);
}));
test("changing non-data code invalidates source compatibility",()=>fixture(x=>{
  fs.writeFileSync(path.join(x.root,"engine-v1/worker.js"),"code-2\n");
  git(x.root,"add",".");git(x.root,"commit","-qm","code changed");
  const next=git(x.root,"rev-parse","HEAD");
  assert.match(check({...x.options,consumerCommit:next}).reason,/source_untrusted/);
}));
test("wrong consumer HEAD denies even valid stored manifest",()=>fixture(x=>{
  assert.equal(check({...x.options,consumerCommit:x.producerCommit}).reason,
    "stage20_input_consumer_head_mismatch");
}));
test("missing/unknown producer manifest input rejects",()=>fixture(x=>{
  assert.equal(check({...x.options,producerInputs:[]}).reason,"stage20_input_set_invalid");
  assert.equal(check({...x.options,producerInputs:[{...x.options.producerInputs[0],
    provenance:"external_live"}]}).reason,"stage20_input_manifest_untrusted");
}));
test("duplicate or traversing required paths rejected",()=>fixture(x=>{
  assert.equal(check({...x.options,requiredInputPaths:["../outside.json"]}).reason,
    "stage20_input_set_invalid");
  assert.equal(check({...x.options,requiredInputPaths:["data/frozen.json","data/frozen.json"]}).reason,
    "stage20_input_set_invalid");
}));
test("symlink input fails closed and never follows it",()=>fixture(x=>{
  fs.unlinkSync(path.join(x.root,"data/frozen.json"));
  fs.symlinkSync(path.join(x.root,"data/other.json"),path.join(x.root,"data/frozen.json"));
  assert.match(check(x.options).reason,/stage20_input_read_or_git_failure/);
}));
test("tampered producer digest is rejected without rewriting input",()=>fixture(x=>{
  const original=fs.readFileSync(path.join(x.root,"data/frozen.json"));
  const manifest=[{...x.options.producerInputs[0],sha256:"f".repeat(64)}];
  assert.match(check({...x.options,producerInputs:manifest}).reason,/stage20_input_bytes_changed/);
  assert.deepEqual(fs.readFileSync(path.join(x.root,"data/frozen.json")),original);
}));
