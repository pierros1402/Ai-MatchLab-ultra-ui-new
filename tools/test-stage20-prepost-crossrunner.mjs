// Deterministic synthetic two-runner archive custody exercise, never Daily.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {inventoryDataTree,compareDataInventories} from "../engine-v1/core/daily-resume-complete-data-inventory.mjs";
import {capturePrepostDeltaToIsolatedArchive,verifyPrepostDeltaArchive} from "../engine-v1/core/daily-resume-prepost-delta-archive.mjs";
const DAY="2026-11-23";
const fixedEnv={...process.env,
  GIT_AUTHOR_DATE:"2000-01-01T00:00:00+00:00",
  GIT_COMMITTER_DATE:"2000-01-01T00:00:00+00:00"};
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",env:fixedEnv}).trim();
function repoFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-crossrunner-"));
  git(root,"init","-q","--initial-branch=main");
  git(root,"config","user.name","AIML Synthetic Runner");
  git(root,"config","user.email","ci@example.invalid");
  fs.mkdirSync(path.join(root,"data/value"),{recursive:true});
  fs.writeFileSync(path.join(root,".gitignore"),"data/value/ignored.json\n");
  fs.writeFileSync(path.join(root,"data/value/base.json"),"{\"base\":1}\n");
  fs.writeFileSync(path.join(root,"data/value/ignored.json"),"{\"ignored\":1}\n");
  git(root,"add",".gitignore","data/value/base.json");
  git(root,"commit","-qm","synthetic baseline");
  return root;
}
function mutation(root) {
  fs.unlinkSync(path.join(root,"data/value/base.json"));
  fs.writeFileSync(path.join(root,"data/value/ignored.json"),"{\"ignored\":2}\n");
  fs.writeFileSync(path.join(root,"data/value/new.json"),"{\"added\":true}\n");
}
export function produceSyntheticPrepostTransport(target) {
  assert.ok(path.isAbsolute(target) && !fs.existsSync(target),"new_absolute_output_root_required");
  const root=repoFixture();
  try {
    const before=inventoryDataTree(root,DAY);
    mutation(root);
    const after=inventoryDataTree(root,DAY);
    fs.mkdirSync(target,{recursive:true});
    const output=capturePrepostDeltaToIsolatedArchive(root,path.join(target,"archive"),before,after);
    fs.writeFileSync(path.join(target,"before.json"),JSON.stringify(before),{flag:"wx"});
    fs.writeFileSync(path.join(target,"after.json"),JSON.stringify(after),{flag:"wx"});
    return {...output,beforeInventorySha256:before.manifestSha256,
      afterInventorySha256:after.manifestSha256,producerCommit:before.sourceCommit};
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
export function consumeSyntheticPrepostTransport(root) {
  const before=JSON.parse(fs.readFileSync(path.join(root,"before.json"),"utf8"));
  const after=JSON.parse(fs.readFileSync(path.join(root,"after.json"),"utf8"));
  const independent=repoFixture();
  try {
    const independentlyComputedBefore=inventoryDataTree(independent,DAY);
    assert.deepEqual(independentlyComputedBefore,before,"different_runner_before_snapshot_mismatch");
    mutation(independent);
    const independentlyComputedAfter=inventoryDataTree(independent,DAY);
    assert.deepEqual(independentlyComputedAfter,after,"different_runner_after_snapshot_mismatch");
    const delta=compareDataInventories(before,after);
    assert.deepEqual([delta.added,delta.modified,delta.deleted],[1,1,1]);
    const checked=verifyPrepostDeltaArchive(path.join(root,"archive"),before,after);
    assert.equal(checked.ok,true,checked.reason);
    assert.equal(checked.entries,3);
    assert.equal(checked.replayAuthorized,false);
    return {verified:true,entries:3,added:1,modified:1,deleted:1,
      ignoredModified:true,byteExact:true,sourceCommit:before.sourceCommit,
      resumeAuthorized:false,publicationAuthorized:false};
  }finally{fs.rmSync(independent,{recursive:true,force:true});}
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try {
    const [mode,absoluteRoot]=process.argv.slice(2);
    assert.ok(path.isAbsolute(absoluteRoot||""));
    if(mode==="produce")console.log("STAGE20_PREPOST_PRODUCER="+JSON.stringify(produceSyntheticPrepostTransport(absoluteRoot)));
    else if(mode==="consume")console.log("STAGE20_PREPOST_CONSUMER="+JSON.stringify(consumeSyntheticPrepostTransport(absoluteRoot)));
    else throw Error("usage: produce|consume ABSOLUTE_ROOT");
  }catch(error){console.error("STAGE20_PREPOST_TRANSPORT_DENIED="+String(error.stack||error));process.exitCode=1;}
}
