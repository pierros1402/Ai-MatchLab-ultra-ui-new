import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {createInvocationReceiptCandidate,auditInvocationReceiptCandidate} from "./daily-resume-invocation-receipt-candidate.mjs";
const source=fs.readFileSync(new URL("../jobs/run-daily-cycle.js",import.meta.url),"utf8");
const census=JSON.parse(fs.readFileSync(new URL("./daily-resume-real-producer-census.json",import.meta.url),"utf8"));
const fixture=()=>({source,census,binding:{dayKey:"2026-11-27",producerCommit:"a".repeat(40),runId:"45960045383",runAttempt:1,sourceSha256:createHash("sha256").update(source).digest("hex")},row:{id:"details.initial",scope:"2026-11-27",status:"completed",exitCode:0,signal:null,startedAtMs:10,completedAtMs:20,inputManifestSha256:"b".repeat(64),outputManifestSha256:"c".repeat(64),deltaManifestSha256:"d".repeat(64)}});
test("candidate receipt binds exact source, run and digests without runtime authority",()=>{
 const f=fixture(),receipt=createInvocationReceiptCandidate(f);
 const a=auditInvocationReceiptCandidate({...f,receipt});
 assert.equal(a.accepted,true);assert.equal(a.receiptIntegrityVerified,true);
 for(const k of ["runtimeAttested","manifestBytesVerified","checkpointReusable","resumeAuthorized","publicationAuthorized"])assert.equal(a[k],false);
});
test("cross-run and cross-attempt receipt replay denied",()=>{
 const f=fixture(),receipt=createInvocationReceiptCandidate(f);
 for(const change of [{runId:"123"},{runAttempt:2},{producerCommit:"e".repeat(40)},{dayKey:"2026-11-28"}])
  assert.equal(auditInvocationReceiptCandidate({...f,binding:{...f.binding,...change},receipt}).accepted,false);
});
test("tampered digest and extra authority fields denied",()=>{
 const f=fixture(),receipt=createInvocationReceiptCandidate(f);
 for(const change of [{outputManifestSha256:"e".repeat(64)},{resumeAuthorized:true},{scope:"2026-11-28"}])
  assert.equal(auditInvocationReceiptCandidate({...f,receipt:{...receipt,...change}}).accepted,false);
});
test("failed, interrupted and reversed-time observations cannot form candidate receipts",()=>{
 const f=fixture();
 for(const change of [{exitCode:1},{signal:"SIGTERM"},{status:"started"},{completedAtMs:9}])
  assert.throws(()=>createInvocationReceiptCandidate({...f,row:{...f.row,...change}}));
});
test("source drift, invalid day and malformed manifest digests denied",()=>{
 const f=fixture();
 assert.throws(()=>createInvocationReceiptCandidate({...f,source:source+"\n"}));
 assert.throws(()=>createInvocationReceiptCandidate({...f,binding:{...f.binding,dayKey:"2026-02-30"}}));
 assert.throws(()=>createInvocationReceiptCandidate({...f,row:{...f.row,inputManifestSha256:"bad"}}));
});
