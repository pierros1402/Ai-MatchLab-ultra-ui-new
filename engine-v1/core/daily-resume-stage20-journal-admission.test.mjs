import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fingerprint} from "./season-closure-contract.js";
import {isApprovedStage20JournalPath,inspectStage20JournalRecord}
  from "./daily-resume-stage20-journal-admission.mjs";
import {evaluateStage20CapturePaths} from "./daily-resume-stage20-admission.mjs";
import {inventoryDataTree} from "./daily-resume-complete-data-inventory.mjs";
import {capturePrepostDeltaToIsolatedArchive,verifyPrepostDeltaArchive}
  from "./daily-resume-prepost-delta-archive.mjs";
import {captureDailyWorktreeDelta,inspectDailyWorktreeDelta}
  from "./daily-resume-worktree-delta.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const entry=(kind,doc)=>"data/history-recovery-journal/"+kind+"/"+fingerprint(doc)+".json";
function fixture(fn){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-journal-admission-"));
  const root=path.join(home,"repo");
  try{
    fs.mkdirSync(root);
    git(root,"init","-q","--initial-branch=main");
    git(root,"config","user.name","AIML test");
    git(root,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(root,"data/value"),{recursive:true});
    fs.writeFileSync(path.join(root,"data/value/stable.json"),"{}\n");
    git(root,"add","data/value/stable.json");
    git(root,"commit","-qm","baseline");
    fn({home,root,archive:path.join(home,"archive")});
  }finally{fs.rmSync(home,{recursive:true,force:true});}
}
const fact={schema:"ai-matchlab.history-recovery-fact.v1",
  fact:{canonicalId:"cid_test_20261123",dayKey:"2026-11-23",source:"synthetic"}};
const hold={schema:"ai-matchlab.history-recovery-hold.v1",
  dayKey:"2026-11-23",errors:[],eligible:[]};
const link={schema:"ai-matchlab.history-recovery-link.v1",
  decision:{kind:"source-bound-fixture-link"}};
test("typed facts, holds and links pass strict fingerprint+content proof",()=>{
  for(const [kind,doc] of [["facts",fact],["holds",hold],["links",link]]){
    const name=entry(kind,doc),raw=JSON.stringify(doc);
    assert.equal(isApprovedStage20JournalPath(name),true);
    assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",paths:[name]}).ok,true);
    assert.deepEqual(inspectStage20JournalRecord(name,raw),{ok:true,reason:null,kind});
  }
});
test("wrong directory, invalid SHA, nested paths and private-key names fail policy",()=>{
  const digest="a".repeat(64);
  for(const name of ["data/history-recovery-journal/facts/private-key.json",
    "data/history-recovery-journal/facts/sub/"+digest+".json",
    "data/history-recovery-journal/other/"+digest+".json",
    "data/history-recovery-journal/facts/"+digest+".json.gz",
    "data/history-recovery-journal/facts/"+digest.toUpperCase()+".json"]){
      assert.equal(isApprovedStage20JournalPath(name),false);
      assert.equal(evaluateStage20CapturePaths({dayKey:"2026-11-23",paths:[name]}).ok,false);
  }
});
test("strict content rejects self-contained filename impersonation",()=>{
  const name=entry("facts",fact);
  assert.equal(inspectStage20JournalRecord(name,JSON.stringify({...fact,fact:{id:"forged"}})).ok,false);
  assert.equal(inspectStage20JournalRecord(name,JSON.stringify({...fact,schema:hold.schema})).ok,false);
  assert.equal(inspectStage20JournalRecord(name,"not json").ok,false);
  assert.equal(inspectStage20JournalRecord(name,Buffer.from([0xff])).ok,false);
});
test("prepost source and verifier admit valid journal and guard independent bytes",()=>fixture(x=>{
  const before=inventoryDataTree(x.root,"2026-11-23");
  const name=entry("facts",fact),full=path.join(x.root,name);
  fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(fact));
  const after=inventoryDataTree(x.root,"2026-11-23");
  const result=capturePrepostDeltaToIsolatedArchive(x.root,x.archive,before,after);
  assert.equal(result.added,1);
  assert.equal(result.resumeAuthorized,false);
  assert.equal(verifyPrepostDeltaArchive(x.archive,before,after).ok,true);
  fs.writeFileSync(path.join(x.archive,"files",name),JSON.stringify({...fact,changed:true}));
  assert.equal(verifyPrepostDeltaArchive(x.archive,before,after).ok,false);
}));
test("prepost capture fails closed on invalid journal even with matching post manifest",()=>fixture(x=>{
  const before=inventoryDataTree(x.root,"2026-11-23");
  const name=entry("facts",fact),full=path.join(x.root,name);
  fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,JSON.stringify({...fact,fact:{id:"forged"}}));
  const after=inventoryDataTree(x.root,"2026-11-23");
  assert.throws(()=>capturePrepostDeltaToIsolatedArchive(x.root,x.archive,before,after),
    /stage20_journal_source_content_invalid/);
  assert.equal(fs.existsSync(x.archive),false);
}));
test("Git worktree delta writer guards source journal bytes and archive proof",()=>fixture(x=>{
  const name=entry("facts",fact),full=path.join(x.root,name);
  fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(fact));
  const options={dayKey:"2026-11-23",stageId:"daily-cycle",baseCommit:git(x.root,"rev-parse","HEAD"),
    allowedPrefixes:["data/history-recovery-journal/"]};
  const result=captureDailyWorktreeDelta(x.root,x.archive,options);
  assert.equal(result.files,1);
  assert.equal(inspectDailyWorktreeDelta(x.archive,options).ok,true);
  fs.writeFileSync(path.join(x.archive,"files",name),JSON.stringify({...fact,fact:{id:"forged"}}));
  assert.equal(inspectDailyWorktreeDelta(x.archive,options).ok,false);
}));
test("Git worktree delta writer rejects forged typed journal bytes",()=>fixture(x=>{
  const name=entry("facts",fact),full=path.join(x.root,name);
  fs.mkdirSync(path.dirname(full),{recursive:true});
  fs.writeFileSync(full,JSON.stringify({...fact,fact:{id:"forged"}}));
  const options={dayKey:"2026-11-23",stageId:"daily-cycle",baseCommit:git(x.root,"rev-parse","HEAD"),
    allowedPrefixes:["data/history-recovery-journal/"]};
  assert.throws(()=>captureDailyWorktreeDelta(x.root,x.archive,options),
    /resume_delta_journal_source_content_invalid/);
  assert.equal(fs.existsSync(x.archive),false);
}));
