import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inventoryDataTree} from "./daily-resume-complete-data-inventory.mjs";
import {capturePrepostDeltaToIsolatedArchive,verifyPrepostDeltaArchive} from "./daily-resume-prepost-delta-archive.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-prepost-"));
  const repo=path.join(home,"repo");fs.mkdirSync(repo);
  try{
    git(repo,"init","-q","--initial-branch=main");
    git(repo,"config","user.name","CI fixture");
    git(repo,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(repo,"data/value"),{recursive:true});
    fs.writeFileSync(path.join(repo,".gitignore"),"data/value/ignored.json\n");
    fs.writeFileSync(path.join(repo,"data/value/original.json"),"{\"old\":true}\n");
    fs.writeFileSync(path.join(repo,"data/value/ignored.json"),"{\"ignored\":1}\n");
    git(repo,"add",".gitignore","data/value/original.json");
    git(repo,"commit","-qm","initial");
    const before=inventoryDataTree(repo,"2026-11-23");
    fs.unlinkSync(path.join(repo,"data/value/original.json"));
    fs.writeFileSync(path.join(repo,"data/value/ignored.json"),"{\"ignored\":2}\n");
    fs.writeFileSync(path.join(repo,"data/value/new.json"),"{\"created\":true}\n");
    const after=inventoryDataTree(repo,"2026-11-23");
    fn({home,repo,before,after,archive:path.join(home,"archive")});
  }finally{fs.rmSync(home,{recursive:true,force:true});}
}
test("isolated archive stores tracked/ignored post-stage writes and exact tombstone",()=>fixture(f=>{
  const output=capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after);
  assert.deepEqual([output.added,output.modified,output.deleted],[1,1,1]);
  assert.equal(output.replayAuthorized,false);
  assert.equal(output.publicationAuthorized,false);
  const checked=verifyPrepostDeltaArchive(f.archive,f.before,f.after);
  assert.equal(checked.ok,true,checked.reason);
  assert.equal(checked.entries,3);
  assert.equal(fs.readFileSync(path.join(f.archive,"files/data/value/ignored.json"),"utf8"),"{\"ignored\":2}\n");
  const manifest=JSON.parse(fs.readFileSync(path.join(f.archive,"manifest.json"),"utf8"));
  assert.ok(manifest.entries.some(e=>e.path==="data/value/original.json"&&e.op==="DELETE"));
  assert.equal(manifest.completeBaseTreeIncluded,false);
}));
test("tampering changed bytes invalidates archive",()=>fixture(f=>{
  capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after);
  fs.writeFileSync(path.join(f.archive,"files/data/value/new.json"),"tampered");
  assert.match(verifyPrepostDeltaArchive(f.archive,f.before,f.after).reason,/stage20_prepost_archive_bytes_mismatch/);
}));
test("extra file in archive denies exact file-set",()=>fixture(f=>{
  capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after);
  fs.writeFileSync(path.join(f.archive,"files/data/value/unexpected.json"),"{}");
  assert.match(verifyPrepostDeltaArchive(f.archive,f.before,f.after).reason,/stage20_prepost_archive_file_set_mismatch/);
}));
test("source mutation after post-scan fails closed without archive",()=>fixture(f=>{
  fs.writeFileSync(path.join(f.repo,"data/value/ignored.json"),"{\"drift\":true}\n");
  assert.throws(()=>capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after),/stage20_prepost_source_drift/);
  assert.equal(fs.existsSync(f.archive),false);
}));
test("unapproved changed path family blocks all capture",()=>fixture(f=>{
  fs.mkdirSync(path.join(f.repo,"data/odds-memory"),{recursive:true});
  fs.writeFileSync(path.join(f.repo,"data/odds-memory/new.json"),"{}");
  const post=inventoryDataTree(f.repo,"2026-11-23");
  assert.throws(()=>capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,post),/stage20_prepost_paths_not_admitted/);
  assert.equal(fs.existsSync(f.archive),false);
}));
test("duplicate archive destination refused rather than overwritten",()=>fixture(f=>{
  capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after);
  assert.throws(()=>capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,f.after),/stage20_prepost_archive_exists/);
}));
test("tampered inventory blocks archive admission",()=>fixture(f=>{
  const corrupt=structuredClone(f.after);corrupt.files[0].sha256="f".repeat(64);
  assert.throws(()=>capturePrepostDeltaToIsolatedArchive(f.repo,f.archive,f.before,corrupt),/stage20_prepost_inventory_not_verified/);
}));
