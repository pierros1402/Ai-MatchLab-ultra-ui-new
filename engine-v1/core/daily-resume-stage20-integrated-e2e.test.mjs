// Real Git/filesystem Stage20 chain integration: NO production Daily, no publication.
// Every scenario uses only disposable isolated local repositories and archive roots.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {inventoryStableDataTree} from "./daily-resume-stable-data-scan.mjs";
import {compareDataInventories} from "./daily-resume-complete-data-inventory.mjs";
import {STAGE20_APPROVED_FAMILIES} from "./daily-resume-stage20-admission.mjs";
import {captureStage20Worktree} from "../jobs/capture-stage20-worktree.mjs";
import {verifyStage20ReplayParity} from "./daily-resume-stage20-replay-parity.mjs";
import {inspectStage20TransportBudget} from "./daily-resume-stage20-transport-budget.mjs";
import {evaluateStage20CompletionEvidence} from "./daily-resume-stage20-completion-evidence.mjs";
const git=(repo,...args)=>execFileSync("git",args,{cwd:repo,encoding:"utf8"}).trim();
const DAY="2026-11-24";
const write=(repo,name,bytes)=>{
  const file=path.join(repo,name);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,bytes);
};
function fixture(fn) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-e2e-"));
  const repo=path.join(tmp,"producer");
  const archive=path.join(tmp,"immutable-delta");
  fs.mkdirSync(repo);
  try {
    git(repo,"init","-q","--initial-branch=main");
    git(repo,"config","user.name","CI fixture");
    git(repo,"config","user.email","ci@example.invalid");
    write(repo,".gitignore","data/value/ignored.json\n");
    write(repo,"data/value/old.json",'{"old":1}\n');
    write(repo,"data/history/remove.json",'{"remove":true}\n');
    write(repo,"data/history/keep.json",'{"keep":true}\n');
    git(repo,"add",".");git(repo,"commit","-qm","frozen synthetic checkpoint baseline");
    const sourceCommit=git(repo,"rev-parse","HEAD");
    const pre=inventoryStableDataTree(repo,DAY).inventory;
    write(repo,"data/value/old.json",'{"old":2}\n');
    write(repo,"data/value/new.json",'{"new":1}\n');
    fs.unlinkSync(path.join(repo,"data/history/remove.json"));
    const post=inventoryStableDataTree(repo,DAY).inventory;
    const delta=compareDataInventories(pre,post);
    const options={dayKey:DAY,stageId:"daily-cycle",baseCommit:sourceCommit,
      allowedPrefixes:STAGE20_APPROVED_FAMILIES};
    fn({tmp,repo,archive,sourceCommit,pre,post,delta,options});
  }finally {fs.rmSync(tmp,{recursive:true,force:true});}
}
function verifiedChain(x) {
  const capture=captureStage20Worktree(x.repo,DAY,x.archive);
  const parity=verifyStage20ReplayParity(x.repo,x.archive,x.options,x.tmp);
  const postFiles=new Map(x.post.files.map(row=>[row.path,row]));
  const written=x.delta.changes.reduce((n,row)=>n+
    (row.action==="delete"?0:postFiles.get(row.path).bytes),0);
  const transport=inspectStage20TransportBudget({
    physicalDataFiles:x.post.fileCount,physicalDataBytes:x.post.totalBytes,
    deltaPaths:x.delta.changes.length,deltaWriteBytes:written,
    ignoredDataFiles:0,unaccountedDataFiles:0,producerCommit:x.sourceCommit
  });
  const cycle={stageId:"daily-cycle",dayKey:DAY,producerCommit:x.sourceCommit,
    runId:"45137286904",runAttempt:1,status:"completed",
    exitCode:0,signal:null,stageComplete:true};
  const receipt=evaluateStage20CompletionEvidence({
    dayKey:DAY,producerCommit:x.sourceCommit,runId:"45137286904",
    runAttempt:1,cycle,preInventory:x.pre,postInventory:x.post,
    transport,parity
  });
  return {capture,parity,transport,cycle,receipt};
}
test("end to end real Git delta -> archive -> clean runner -> complete-tree parity -> bounded evidence",()=>fixture(x=>{
  const result=verifiedChain(x);
  assert.equal(result.capture.files,3);
  assert.equal(result.capture.writes,2);
  assert.equal(result.capture.deletions,1);
  assert.equal(result.parity.ok,true);
  assert.equal(result.parity.fileCount,3);
  assert.equal(result.parity.fullTreeInventorySha256,x.post.manifestSha256);
  assert.equal(result.transport.budgetEligible,true);
  assert.equal(result.receipt.evidenceQualified,true);
  assert.equal(result.receipt.changedPaths,3);
  assert.equal(result.receipt.checkpointSha256,result.capture.checkpointSha256);
  assert.equal(result.receipt.checkpointReusable,false);
  assert.equal(result.receipt.resumeAuthorized,false);
  assert.equal(result.receipt.publicationAuthorized,false);
  assert.deepEqual(fs.readdirSync(x.tmp).sort(),["immutable-delta","producer"]);
}));
test("ignored producer output blocks checkpoint before archiving",()=>fixture(x=>{
  write(x.repo,"data/value/ignored.json",'{"ignored":"not-transported"}\n');
  assert.throws(()=>captureStage20Worktree(x.repo,DAY,x.archive),
    /stage20_capture_denied:stage20_ignored_outputs_unaccounted/);
  assert.equal(fs.existsSync(x.archive),false);
}));
test("tampered archive byte rejects full replay and cannot qualify",()=>fixture(x=>{
  captureStage20Worktree(x.repo,DAY,x.archive);
  write(x.archive,"files/data/value/old.json","FORGED\n");
  assert.throws(()=>verifyStage20ReplayParity(x.repo,x.archive,x.options,x.tmp),
    /stage20_parity_archive_denied/);
}));
test("late physical output rejects replay of previously complete archive",()=>fixture(x=>{
  captureStage20Worktree(x.repo,DAY,x.archive);
  write(x.repo,"data/value/extra.json",'{"late":true}\n');
  assert.throws(()=>verifyStage20ReplayParity(x.repo,x.archive,x.options,x.tmp),
    /stage20_parity_full_tree_mismatch/);
}));
test("failed original Daily cannot produce qualified completion receipt",()=>fixture(x=>{
  const {receipt,...chain}=verifiedChain(x);
  const cycle={...chain.cycle,status:"completed",exitCode:1,stageComplete:false};
  const denied=evaluateStage20CompletionEvidence({
    dayKey:DAY,producerCommit:x.sourceCommit,runId:"45137286904",
    runAttempt:1,cycle,preInventory:x.pre,postInventory:x.post,
    transport:chain.transport,parity:chain.parity
  });
  assert.equal(receipt.evidenceQualified,true);
  assert.equal(denied.evidenceQualified,false);
  assert.equal(denied.reason,"stage20_completion_cycle_unproven");
  assert.equal(denied.resumeAuthorized,false);
}));
test("a fabricated archive budget cannot defeat exact changed-write byte binding",()=>fixture(x=>{
  const result=verifiedChain(x);
  const forged={...result.transport,deltaWriteBytes:result.transport.deltaWriteBytes-1};
  const denied=evaluateStage20CompletionEvidence({
    dayKey:DAY,producerCommit:x.sourceCommit,runId:"45137286904",
    runAttempt:1,cycle:result.cycle,preInventory:x.pre,postInventory:x.post,
    transport:forged,parity:result.parity
  });
  assert.equal(denied.reason,"stage20_completion_transport_write_bytes_unbound");
}));
