import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inventoryStableDataTree,compareStableDataPasses} from "./daily-resume-stable-data-scan.mjs";
import {inventoryDataTree} from "./daily-resume-complete-data-inventory.mjs";
const git=(cwd,...args)=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stable-stage20-"));
  try {
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","CI fixture");git(root,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(root,"data/odds-memory"),{recursive:true});
    fs.writeFileSync(path.join(root,".gitignore"),"data/odds-memory/\n");
    fs.writeFileSync(path.join(root,"data/odds-memory/a.json"),"{\"v\":1}\n");
    fs.writeFileSync(path.join(root,"data/odds-memory/stable.json"),"{\"stable\":true}\n");
    git(root,"add",".gitignore");git(root,"commit","-qm","source");
    fn(root);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("two identical real scans are hash-bound but never writer-quiescence proof",()=>fixture(root=>{
  const report=inventoryStableDataTree(root,"2026-11-23");
  assert.equal(report.stability.ok,true);
  assert.equal(report.stability.consecutivePasses,2);
  assert.equal(report.stability.writerQuiescenceAttested,false);
  assert.equal(report.stability.resumeAuthorized,false);
  assert.equal(report.stability.publicationAuthorized,false);
}));
test("ignored content mutation between scans fails closed",()=>fixture(root=>{
  assert.throws(()=>inventoryStableDataTree(root,"2026-11-23",{
    betweenPasses:()=>fs.writeFileSync(path.join(root,"data/odds-memory/a.json"),"{\"v\":2}\n")
  }),/stage20_data_changed_between_passes/);
}));
test("ignored new file between scans fails closed",()=>fixture(root=>{
  assert.throws(()=>inventoryStableDataTree(root,"2026-11-23",{
    betweenPasses:()=>fs.writeFileSync(path.join(root,"data/odds-memory/new.json"),"{}")
  }),/stage20_data_changed_between_passes/);
}));
test("ignored deletion between scans fails closed",()=>fixture(root=>{
  assert.throws(()=>inventoryStableDataTree(root,"2026-11-23",{
    betweenPasses:()=>fs.unlinkSync(path.join(root,"data/odds-memory/a.json"))
  }),/stage20_data_changed_between_passes/);
}));
test("source commit shift between scans fails closed",()=>fixture(root=>{
  assert.throws(()=>inventoryStableDataTree(root,"2026-11-23",{
    betweenPasses:()=>{
      fs.writeFileSync(path.join(root,"README.md"),"change\n");
      git(root,"add","README.md");git(root,"commit","-qm","change source");
    }
  }),/stage20_stability_source_mismatch/);
}));
test("tampered manifest cannot be promoted to stability verdict",()=>fixture(root=>{
  const original=inventoryDataTree(root,"2026-11-23");
  const corrupt=structuredClone(original);corrupt.manifestSha256="a".repeat(64);
  assert.throws(()=>compareStableDataPasses(original,corrupt),/stage20_stability_inventory_invalid/);
}));
test("quiescence claim is forbidden even if physical bytes match",()=>fixture(root=>{
  const a=inventoryDataTree(root,"2026-11-23"),b=inventoryDataTree(root,"2026-11-23");
  const result=compareStableDataPasses(a,b);
  assert.equal(result.ok,true);
  assert.equal(result.writerQuiescenceAttested,false);
}));
