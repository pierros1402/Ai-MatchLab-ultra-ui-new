import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {observeStage20Pre,observeStage20Post,observeStage20FailedCycle} from "./observe-stage20-data-inventory.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
function fixture(fn) {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-boundary-"));
  const repo=path.join(parent,"repo"),temp=path.join(parent,"temp");
  fs.mkdirSync(repo);fs.mkdirSync(temp);
  try {
    git(repo,"init","-q","--initial-branch=main");
    git(repo,"config","user.name","CI");
    git(repo,"config","user.email","ci@example.invalid");
    fs.mkdirSync(path.join(repo,"data/value"),{recursive:true});
    fs.writeFileSync(path.join(repo,".gitignore"),"data/value/ignored.json\n");
    fs.writeFileSync(path.join(repo,"data/value/old.json"),"{\"v\":1}\n");
    fs.writeFileSync(path.join(repo,"data/value/ignored.json"),"{\"ignored\":1}\n");
    git(repo,"add",".gitignore","data/value/old.json");
    git(repo,"commit","-qm","fixture");
    fn({repo,temp,parent});
  }finally{fs.rmSync(parent,{recursive:true,force:true});}
}
test("pre/post source-bound whole data tree captures ignored edits and deletions only in temp",()=>fixture(x=>{
  const pre=observeStage20Pre(x.repo,"2026-11-23",x.temp);
  assert.equal(pre.fileCount,2);
  assert.equal(pre.resumeAuthorized,false);
  const old=fs.readFileSync(path.join(x.repo,"data/value/old.json"),"utf8");
  assert.equal(old,"{\"v\":1}\n");
  fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"ignored\":2}\n");
  fs.unlinkSync(path.join(x.repo,"data/value/old.json"));
  fs.writeFileSync(path.join(x.repo,"data/value/new.json"),"{\"new\":1}\n");
  const after=observeStage20Post(x.repo,"2026-11-23",x.temp);
  assert.deepEqual([after.added,after.modified,after.deleted],[1,1,1]);
  assert.equal(after.publicationAuthorized,false);
  assert.equal(after.ignoredIncluded,true);
  assert.deepEqual(fs.readdirSync(x.temp).sort(),[
    "aiml-stage20-delta.json","aiml-stage20-post.json","aiml-stage20-pre.json"
  ]);
  assert.equal(fs.existsSync(path.join(x.repo,"data","stage20-observer")),false);
}));
test("pre evidence cannot be overwritten",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  assert.throws(()=>observeStage20Pre(x.repo,"2026-11-23",x.temp),/stage20_observation_evidence_exists/);
}));
test("post cannot run without exact pre evidence",()=>fixture(x=>{
  assert.throws(()=>observeStage20Post(x.repo,"2026-11-23",x.temp),/stage20_observation_pre_missing/);
}));
test("tampered pre file rejected before any post output",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  const file=path.join(x.temp,"aiml-stage20-pre.json");
  const doc=JSON.parse(fs.readFileSync(file,"utf8"));
  doc.files[0].sha256="f".repeat(64);
  fs.writeFileSync(file,JSON.stringify(doc));
  assert.throws(()=>observeStage20Post(x.repo,"2026-11-23",x.temp),/stage20_observation_pre_invalid/);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-post.json")),false);
}));
test("source commit drift invalidates pre/post pairing",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  fs.writeFileSync(path.join(x.repo,"README.md"),"changed\n");
  git(x.repo,"add","README.md");git(x.repo,"commit","-qm","new source");
  assert.throws(()=>observeStage20Post(x.repo,"2026-11-23",x.temp),/stage20_prepost_source_mismatch/);
}));
test("runner output must not escape runner temp",()=>fixture(x=>{
  assert.throws(()=>observeStage20Pre(x.repo,"2026-11-23","relative"),/stage20_observation_temp_binding_invalid/);
  assert.equal(fs.existsSync(path.join(x.repo,"aiml-stage20-pre.json")),false);
}));
test("day scope cannot be loosened or reused",()=>fixture(x=>{
  assert.throws(()=>observeStage20Pre(x.repo,"today",x.temp),/stage20_observation_day_invalid/);
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  assert.throws(()=>observeStage20Post(x.repo,"2026-11-24",x.temp),/stage20_observation_pre_invalid/);
}));
test("symlink in data denies preflight evidence",()=>fixture(x=>{
  fs.symlinkSync(path.join(x.repo,"data/value/old.json"),path.join(x.repo,"data/value/link.json"));
  assert.throws(()=>observeStage20Pre(x.repo,"2026-11-23",x.temp),/stage20_inventory_symlink_forbidden/);
  assert.equal(fs.readdirSync(x.temp).length,0);
}));

test("pre observer double-scan drift denies evidence and leaves runner temp untouched",()=>fixture(x=>{
  assert.throws(()=>observeStage20Pre(x.repo,"2026-11-23",x.temp,{
    betweenPasses:()=>fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"drift\":1}\n")
  }),/stage20_data_changed_between_passes/);
  assert.deepEqual(fs.readdirSync(x.temp),[]);
}));
test("post observer double-scan drift denies post/delta evidence while retaining verified pre",()=>fixture(x=>{
  const pre=observeStage20Pre(x.repo,"2026-11-23",x.temp);
  assert.equal(pre.consecutiveVerifiedPasses,2);
  fs.writeFileSync(path.join(x.repo,"data/value/new.json"),"{\"new\":true}\n");
  assert.throws(()=>observeStage20Post(x.repo,"2026-11-23",x.temp,{
    betweenPasses:()=>fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"drift\":2}\n")
  }),/stage20_data_changed_between_passes/);
  assert.deepEqual(fs.readdirSync(x.temp),["aiml-stage20-pre.json"]);
}));
test("successful pre/post observer attests exactly two stable passes, never writer lease",()=>fixture(x=>{
  const pre=observeStage20Pre(x.repo,"2026-11-23",x.temp);
  fs.writeFileSync(path.join(x.repo,"data/value/new.json"),"{}\n");
  const post=observeStage20Post(x.repo,"2026-11-23",x.temp);
  assert.equal(pre.consecutiveVerifiedPasses,2);
  assert.equal(post.consecutiveVerifiedPasses,2);
  assert.equal(pre.writerQuiescenceAttested,false);
  assert.equal(post.writerQuiescenceAttested,false);
  assert.equal(post.resumeAuthorized,false);
}));

test("failed cycle produces separate incomplete evidence, not a reusable checkpoint",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"partial\":true}\n");
  const report=observeStage20FailedCycle(x.repo,"2026-11-23",x.temp);
  assert.equal(report.phase,"failed-cycle");
  assert.equal(report.cycleOutcome,"failure");
  assert.equal(report.stageComplete,false);
  assert.equal(report.resumeAuthorized,false);
  assert.equal(report.publicationAuthorized,false);
  assert.equal(report.consecutiveVerifiedPasses,2);
  assert.equal(report.modified,1);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-post.json")),false);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-delta.json")),false);
  const doc=JSON.parse(fs.readFileSync(path.join(x.temp,"aiml-stage20-failure-delta.json"),"utf8"));
  assert.equal(doc.stageComplete,false);
  assert.equal(doc.resumable,false);
}));
test("failed cycle evidence requires completed pre and leaves no partial evidence on missing pre",()=>fixture(x=>{
  assert.throws(()=>observeStage20FailedCycle(x.repo,"2026-11-23",x.temp),
    /stage20_failed_cycle_pre_missing/);
  assert.deepEqual(fs.readdirSync(x.temp),[]);
}));
test("failed cycle cannot reclassify prior complete post evidence",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  observeStage20Post(x.repo,"2026-11-23",x.temp);
  assert.throws(()=>observeStage20FailedCycle(x.repo,"2026-11-23",x.temp),
    /stage20_failed_cycle_success_evidence_conflict/);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-failure-post.json")),false);
}));
test("failed-cycle instability rejects before writing incomplete post artifacts",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  assert.throws(()=>observeStage20FailedCycle(x.repo,"2026-11-23",x.temp,{
    betweenPasses:()=>fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"unstable\":1}\n")
  }),/stage20_data_changed_between_passes/);
  assert.deepEqual(fs.readdirSync(x.temp),["aiml-stage20-pre.json"]);
}));

test("actual failed-post CLI dispatches and preserves incomplete state with real runner env",()=>fixture(x=>{
  observeStage20Pre(x.repo,"2026-11-23",x.temp);
  fs.writeFileSync(path.join(x.repo,"data/value/ignored.json"),"{\"partial\":17}\n");
  const cli=path.resolve("engine-v1/jobs/observe-stage20-data-inventory.mjs");
  const output=execFileSync(process.execPath,[cli,"failed-post","2026-11-23"],{
    cwd:x.repo,encoding:"utf8",env:{...process.env,RUNNER_TEMP:x.temp}
  }).trim();
  assert.ok(output.startsWith("STAGE20_BOUNDARY_OBSERVATION="));
  const report=JSON.parse(output.slice(output.indexOf("=")+1));
  assert.equal(report.phase,"failed-cycle");
  assert.equal(report.stageComplete,false);
  assert.equal(report.resumeAuthorized,false);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-failure-delta.json")),true);
  assert.equal(fs.existsSync(path.join(x.temp,"aiml-stage20-post.json")),false);
}));
