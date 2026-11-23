import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {
  inventoryDataTree, verifyDataInventory, compareDataInventories
} from "./daily-resume-complete-data-inventory.mjs";
function git(root,...args){return execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();}
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-complete-tree-"));
  try {
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","CI fixture");
    git(root,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(root,"data","value"),{recursive:true});
    fs.mkdirSync(path.join(root,"data","odds-memory"),{recursive:true});
    fs.writeFileSync(path.join(root,".gitignore"),"data/odds-memory/\n");
    fs.writeFileSync(path.join(root,"data/value/old.json"),"{\"old\":1}\n");
    fs.writeFileSync(path.join(root,"data/odds-memory/ignored.json"),"{\"before\":1}\n");
    git(root,"add",".gitignore","data/value/old.json");
    git(root,"commit","-qm","fixture");
    fn(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("both Git-tracked and ignored files are included in pre-stage scan",()=>fixture(root=>{
  const m=inventoryDataTree(root,"2026-11-23");
  assert.equal(m.fileCount,2);
  assert.ok(m.files.some(r=>r.path==="data/odds-memory/ignored.json"));
  assert.ok(m.files.some(r=>r.path==="data/value/old.json"));
  assert.equal(verifyDataInventory(m).ok,true);
  assert.equal(m.resumeAuthorized,false);
}));
test("pre/post detects ignored modification, addition and explicit deletion",()=>fixture(root=>{
  const before=inventoryDataTree(root,"2026-11-23");
  fs.writeFileSync(path.join(root,"data/odds-memory/ignored.json"),"{\"after\":2}\n");
  fs.unlinkSync(path.join(root,"data/value/old.json"));
  fs.writeFileSync(path.join(root,"data/value/new.json"),"{}\n");
  const after=inventoryDataTree(root,"2026-11-23");
  const delta=compareDataInventories(before,after);
  assert.deepEqual([delta.added,delta.modified,delta.deleted],[1,1,1]);
  assert.deepEqual(delta.changes.map(r=>r.action).sort(),["add","delete","modify"]);
  assert.equal(delta.completeGitIgnoreIndependentComparison,true);
  assert.equal(delta.quiescenceAttested,false);
  assert.equal(delta.stageCaptureAuthorized,false);
}));
test("no filesystem changes yields fixed-point empty delta",()=>fixture(root=>{
  const a=inventoryDataTree(root,"2026-11-23"),b=inventoryDataTree(root,"2026-11-23");
  assert.equal(a.manifestSha256,b.manifestSha256);
  assert.equal(compareDataInventories(a,b).changes.length,0);
}));
test("tampered pre-stage SHA and missing rows fail closed",()=>fixture(root=>{
  const a=inventoryDataTree(root,"2026-11-23"),b=inventoryDataTree(root,"2026-11-23");
  const tampered=structuredClone(a);
  tampered.files[0].sha256="f".repeat(64);
  assert.equal(verifyDataInventory(tampered).ok,false);
  assert.throws(()=>compareDataInventories(tampered,b),/stage20_prepost_inventory_invalid/);
  const missing=structuredClone(a);missing.files.pop();
  assert.equal(verifyDataInventory(missing).ok,false);
}));
test("source commit drift invalidates stage equivalence",()=>fixture(root=>{
  const a=inventoryDataTree(root,"2026-11-23");
  fs.writeFileSync(path.join(root,"README.md"),"new source\n");
  git(root,"add","README.md");git(root,"commit","-qm","change code");
  const b=inventoryDataTree(root,"2026-11-23");
  assert.throws(()=>compareDataInventories(a,b),/stage20_prepost_source_mismatch/);
}));
test("invalid day rejected and symlink inside data fails closed",()=>fixture(root=>{
  assert.throws(()=>inventoryDataTree(root,"today"),/stage20_inventory_day_invalid/);
  fs.symlinkSync(path.join(root,".gitignore"),path.join(root,"data","value","symlink.json"));
  assert.throws(()=>inventoryDataTree(root,"2026-11-23"),/stage20_inventory_symlink_forbidden/);
}));
test("nonempty source root required",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-no-data-"));
  try {
    git(root,"init","-q","--initial-branch=main");
    assert.throws(()=>inventoryDataTree(root,"2026-11-23"),/stage20_inventory_root_invalid/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
