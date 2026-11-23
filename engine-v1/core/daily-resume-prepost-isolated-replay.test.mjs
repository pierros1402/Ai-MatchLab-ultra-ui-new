import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inventoryDataTree} from "./daily-resume-complete-data-inventory.mjs";
import {capturePrepostDeltaToIsolatedArchive} from "./daily-resume-prepost-delta-archive.mjs";
import {replayPrepostDeltaToIsolatedClone} from "./daily-resume-prepost-isolated-replay.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(callback) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-full-replay-"));
  const baseline=path.join(root,"baseline");
  const producer=path.join(root,"producer");
  const archive=path.join(root,"archive");
  fs.mkdirSync(baseline);
  try{
    git(baseline,"init","-q","--initial-branch=main");
    git(baseline,"config","user.name","CI fixture");
    git(baseline,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(baseline,"data/value"),{recursive:true});
    fs.mkdirSync(path.join(baseline,"data/history-index"),{recursive:true});
    fs.writeFileSync(path.join(baseline,".gitignore"),"data/value/ignored.json\n");
    fs.writeFileSync(path.join(baseline,"data/value/old.json"),"{\"old\":1}\n");
    fs.writeFileSync(path.join(baseline,"data/value/ignored.json"),"{\"ignored\":1}\n");
    fs.writeFileSync(path.join(baseline,"data/history-index/source.json"),"{\"untouched\":1}\n");
    git(baseline,"add",".gitignore","data/value/old.json","data/history-index/source.json");
    git(baseline,"commit","-qm","baseline");
    git(root,"clone","--quiet",baseline,producer);
    fs.writeFileSync(path.join(producer,"data/value/ignored.json"),"{\"ignored\":1}\n");
    const before=inventoryDataTree(producer,"2026-11-23");
    fs.writeFileSync(path.join(producer,"data/value/ignored.json"),"{\"ignored\":2}\n");
    fs.unlinkSync(path.join(producer,"data/value/old.json"));
    fs.writeFileSync(path.join(producer,"data/value/new.json"),"{\"added\":true}\n");
    const after=inventoryDataTree(producer,"2026-11-23");
    capturePrepostDeltaToIsolatedArchive(producer,archive,before,after);
    callback({root,baseline,producer,archive,before,after});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
function replay(f) {
  return replayPrepostDeltaToIsolatedClone({
    sourceRepoRoot:f.baseline,archiveRoot:f.archive,
    before:f.before,after:f.after,parent:f.root
  });
}
test("verified full baseline and delta recover exact final tree including ignored output",()=>fixture(f=>{
  const p=replay(f);
  assert.equal(p.completeBaselineParity,true);
  assert.equal(p.completeFinalTreeParity,true);
  assert.equal(p.totalFiles,3);
  assert.equal(p.resumeAuthorized,false);
  assert.equal(p.publicationAuthorized,false);
  assert.equal(fs.readFileSync(path.join(p.stagingClone,"data/value/ignored.json"),"utf8"),"{\"ignored\":2}\n");
  assert.equal(fs.existsSync(path.join(p.stagingClone,"data/value/old.json")),false);
  assert.equal(fs.readFileSync(path.join(p.stagingClone,"data/history-index/source.json"),"utf8"),"{\"untouched\":1}\n");
  assert.equal(inventoryDataTree(p.stagingClone,"2026-11-23").manifestSha256,f.after.manifestSha256);
}));
test("altered ignored baseline byte fails before delta replay",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.baseline,"data/value/ignored.json"),"{\"wrong\":true}\n");
  assert.throws(()=>replay(f),/stage20_replay_baseline_sha_mismatch/);
}));
test("missing old baseline path blocks complete parity",()=>fixture(f=>{
  fs.unlinkSync(path.join(f.baseline,"data/value/old.json"));
  assert.throws(()=>replay(f));
}));
test("archive payload tampering denies replay before source changes",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.archive,"files/data/value/new.json"),"different bytes");
  assert.throws(()=>replay(f),/stage20_replay_archive_invalid/);
  assert.equal(fs.readFileSync(path.join(f.baseline,"data/value/old.json"),"utf8"),"{\"old\":1}\n");
}));
test("unexpected pre-stage file is not silently carried into final clone",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.baseline,"data/value/extra.json"),"{}\n");
  // All baseline data, including unexpected files, are copied; hash parity rejects.
  assert.throws(()=>replay(f),/stage20_replay_baseline_sha_mismatch/);
}));
test("different source commit refuses replay",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.baseline,"README.md"),"changed\n");
  git(f.baseline,"add","README.md");git(f.baseline,"commit","-qm","code drift");
  assert.throws(()=>replay(f),/stage20_replay_source_commit_mismatch/);
}));
test("pre-stage symlink is rejected",()=>fixture(f=>{
  const target=path.join(f.baseline,"data/value/ignored.json");
  fs.unlinkSync(target);
  fs.symlinkSync(path.join(f.baseline,"data/value/old.json"),target);
  assert.throws(()=>replay(f),/stage20_replay_symlink_forbidden/);
}));
test("invalid parent or binding cannot proceed",()=>fixture(f=>{
  assert.throws(()=>replayPrepostDeltaToIsolatedClone({
    sourceRepoRoot:f.baseline,archiveRoot:f.archive,before:f.before,after:f.after,parent:"relative"
  }),/stage20_replay_arguments_invalid/);
}));
