import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {auditStage20JournalFile as audit} from "./audit-stage20-runtime-boundary-journal.mjs";
import {JOURNAL_SCHEMA} from "./observe-daily-runtime-boundaries.mjs";
const DAY="2026-11-24";
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-runtime-journal-cli-"));
  const repoRoot=path.join(root,"repo"),runnerTemp=path.join(root,"runner");
  const src=path.join(repoRoot,"engine-v1/jobs/run-daily-cycle.js");
  const actual=fs.readFileSync(path.join(process.cwd(),"engine-v1/jobs/run-daily-cycle.js"));
  fs.mkdirSync(path.dirname(src),{recursive:true});fs.mkdirSync(runnerTemp);
  fs.writeFileSync(src,actual);
  const sourceSha256=digest(actual);
  const journal=path.join(runnerTemp,"aiml-daily-boundary-journal.jsonl");
  const event=(id,phase,second=0)=>({
    schema:JOURNAL_SCHEMA,dayKey:DAY,sourceSha256,stageId:id,phase,
    observedAt:new Date(Date.UTC(2026,10,24,8,0,second)).toISOString(),
    resumeAuthorized:false,publicationAuthorized:false
  });
  const save=(rows,trailingNewline=true)=>
    fs.writeFileSync(journal,rows.map(x=>JSON.stringify(x)).join("\n")+
      (trailingNewline?"\n":""));
  try{fn({root,repoRoot,runnerTemp,dayKey:DAY,journal,event,save,sourceSha256,src})}
  finally{fs.rmSync(root,{recursive:true,force:true})}
}
test("real Daily source partial journal is auditable but nonresumable",()=>fixture(f=>{
  f.save([f.event("provider-competition-discovery","start")]);
  const r=audit(f);
  assert.equal(r.accepted,true);
  assert.equal(r.sourcePairedMarkerCount,63);
  assert.equal(r.observedIncompletePairs,1);
  assert.equal(r.readOnly,true);
  assert.equal(r.originalRunnerExitVerified,false);
  assert.equal(r.completeCycleProven,false);
  assert.equal(r.crossRunReuseAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
}));
test("complete start/done marker has no stage-output completion authority",()=>fixture(f=>{
  f.save([f.event("provider-competition-discovery","start"),
    f.event("provider-competition-discovery","done",1)]);
  const r=audit(f);
  assert.equal(r.observedPairedDone,1);
  assert.equal(r.stageCompletionReceiptsVerified,false);
  assert.equal(r.resumeAuthorized,false);
}));
test("truncated JSONL, even if final JSON is parseable, is denied",()=>fixture(f=>{
  f.save([f.event("provider-competition-discovery","start")],false);
  assert.throws(()=>audit(f),/stage20_journal_cli_utf8_or_truncation_invalid/);
}));
test("unknown or forged source marker fails closed",()=>fixture(f=>{
  f.save([f.event("made-up-stage","done")]);
  assert.throws(()=>audit(f),/stage20_journal_cli_audit_denied:stage20_journal_unknown_source_marker/);
}));
test("mutation of original Daily source blocks previously captured journal",()=>fixture(f=>{
  f.save([f.event("provider-competition-discovery","start")]);
  fs.appendFileSync(f.src,"\n// changed producer bytes\n");
  assert.throws(()=>audit(f),/stage20_journal_cli_audit_denied:stage20_journal_event_binding_invalid/);
}));
test("symlinked journal cannot be read",()=>fixture(f=>{
  const outside=path.join(f.root,"outside.jsonl");
  fs.writeFileSync(outside,"{}\n");
  fs.symlinkSync(outside,f.journal);
  assert.throws(()=>audit(f),/stage20_journal_cli_file_untrusted/);
}));
test("empty journal and wrong day binding fail closed",()=>fixture(f=>{
  fs.writeFileSync(f.journal,"");
  assert.throws(()=>audit(f),/stage20_journal_cli_size_invalid/);
  assert.throws(()=>audit({...f,dayKey:"not-day"}),/stage20_journal_cli_binding_invalid/);
}));
test("duplicate done events cannot become independent checkpoint receipts",()=>fixture(f=>{
  f.save([f.event("provider-competition-discovery","start"),
    f.event("provider-competition-discovery","done",1),
    f.event("provider-competition-discovery","done",2)]);
  assert.throws(()=>audit(f),/stage20_journal_cli_audit_denied:stage20_journal_done_without_single_start/);
}));
