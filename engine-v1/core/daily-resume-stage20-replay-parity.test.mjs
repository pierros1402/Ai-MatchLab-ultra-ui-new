import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {captureStage20Worktree} from "../jobs/capture-stage20-worktree.mjs";
import {STAGE20_APPROVED_FAMILIES} from "./daily-resume-stage20-admission.mjs";
import {verifyStage20ReplayParity} from "./daily-resume-stage20-replay-parity.mjs";
const cmd=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-full-tree-"));
  const repo=path.join(root,"source");
  fs.mkdirSync(repo);
  try {
    cmd(repo,"init","-q","--initial-branch=main");
    cmd(repo,"config","user.name","Fixture");
    cmd(repo,"config","user.email","fixture@example.invalid");
    fs.mkdirSync(path.join(repo,"data/value"),{recursive:true});
    fs.mkdirSync(path.join(repo,"data/history"),{recursive:true});
    fs.writeFileSync(path.join(repo,"data/value/old.json"),'{"v":0}\n');
    fs.writeFileSync(path.join(repo,"data/history/keep.json"),'{"keep":true}\n');
    fs.writeFileSync(path.join(repo,"data/history/delete.json"),'{"remove":true}\n');
    cmd(repo,"add",".");cmd(repo,"commit","-qm","base");
    const baseCommit=cmd(repo,"rev-parse","HEAD");
    fs.writeFileSync(path.join(repo,"data/value/old.json"),'{"v":1}\n');
    fs.writeFileSync(path.join(repo,"data/value/new.json"),'{"created":true}\n');
    fs.unlinkSync(path.join(repo,"data/history/delete.json"));
    const archive=path.join(root,"archive");
    const dayKey="2026-11-24";
    const options={dayKey,stageId:"daily-cycle",baseCommit,
      allowedPrefixes:STAGE20_APPROVED_FAMILIES};
    fn({root,repo,archive,options});
  }finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test("complete tracked/untracked tree replays byte-identically, then clone is removed",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  const result=verifyStage20ReplayParity(x.repo,x.archive,x.options,x.root);
  assert.equal(result.ok,true);
  assert.equal(result.fileCount,3);
  assert.equal(result.sandboxReplayVerified,true);
  assert.equal(result.writerQuiescenceAttested,false);
  assert.equal(result.resumeAuthorized,false);
  assert.equal(result.publicationAuthorized,false);
  assert.deepEqual(fs.readdirSync(x.root).sort(),["archive","source"]);
}));
test("missing captured physical data change is detected",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  fs.writeFileSync(path.join(x.repo,"data/value/late.json"),'{"late":1}\n');
  assert.throws(
    ()=>verifyStage20ReplayParity(x.repo,x.archive,x.options,x.root),
    /stage20_parity_full_tree_mismatch/);
  assert.deepEqual(fs.readdirSync(x.root).sort(),["archive","source"]);
}));
test("ignored data is denied before replay, rather than silently omitted",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  fs.writeFileSync(path.join(x.repo,".gitignore"),"data/value/ignored.json\n");
  fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),'{"ignored":true}\n');
  assert.throws(
    ()=>verifyStage20ReplayParity(x.repo,x.archive,x.options,x.root),
    /stage20_parity_source_denied/);
  assert.deepEqual(fs.readdirSync(x.root).sort(),["archive","source"]);
}));
test("artifact byte tampering fails closed",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  fs.writeFileSync(path.join(x.archive,"files/data/value/old.json"),"TAMPERED\n");
  assert.throws(
    ()=>verifyStage20ReplayParity(x.repo,x.archive,x.options,x.root),
    /stage20_parity_archive_denied/);
  assert.deepEqual(fs.readdirSync(x.root).sort(),["archive","source"]);
}));
test("different producer commit cannot claim parity",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  assert.throws(
    ()=>verifyStage20ReplayParity(x.repo,x.archive,
      {...x.options,baseCommit:"b".repeat(40)},x.root),
    /stage20_parity_source_commit_mismatch/);
}));
test("mismatched day refuses archive admission",()=>fixture(x=>{
  captureStage20Worktree(x.repo,x.options.dayKey,x.archive);
  assert.throws(
    ()=>verifyStage20ReplayParity(x.repo,x.archive,
      {...x.options,dayKey:"2026-11-23"},x.root),
    /stage20_parity_archive_denied/);
}));
