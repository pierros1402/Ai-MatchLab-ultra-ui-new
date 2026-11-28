import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {inventoryDataTree,compareDataInventories} from "./daily-resume-complete-data-inventory.mjs";
import {capturePrepostDeltaToIsolatedArchive} from "./daily-resume-prepost-delta-archive.mjs";
import {createInvocationReceiptCandidate} from "./daily-resume-invocation-receipt-candidate.mjs";
import {auditInvocationManifestBytes} from "./daily-resume-invocation-manifest-byte-audit.mjs";
const source=fs.readFileSync(new URL("../jobs/run-daily-cycle.js",import.meta.url),"utf8");
const census=JSON.parse(fs.readFileSync(new URL("./daily-resume-real-producer-census.json",import.meta.url),"utf8"));
const hash=s=>createHash("sha256").update(s).digest("hex");
const git=(cwd,...args)=>execFileSync("git",args,{cwd,encoding:"utf8"}).trim();
function fixture(fn,noop=false){
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),"aiml-receipt-bytes-")));
 try{
 const beforeRoot=path.join(home,"before"),afterRoot=path.join(home,"after");
 fs.mkdirSync(path.join(beforeRoot,"data/value"),{recursive:true});
 git(beforeRoot,"init","-q");git(beforeRoot,"config","user.name","CI");git(beforeRoot,"config","user.email","ci@example.invalid");
 for(const n of ["stable","delete","modify"])fs.writeFileSync(path.join(beforeRoot,"data/value",n+".json"),JSON.stringify({name:n}));
 git(beforeRoot,"add","data");git(beforeRoot,"commit","-qm","fixture");
 // Use an independent Git checkout rather than copying live .git internals.
 // --no-local avoids hardlinks and races with background Git maintenance.
 git(home,"clone","--quiet","--no-local",beforeRoot,afterRoot);
 assert.equal(git(afterRoot,"rev-parse","HEAD"),git(beforeRoot,"rev-parse","HEAD"));
 if(!noop){
 fs.unlinkSync(path.join(afterRoot,"data/value/delete.json"));
 fs.writeFileSync(path.join(afterRoot,"data/value/modify.json"),"{}");
 fs.writeFileSync(path.join(afterRoot,"data/value/add.json"),"{}");
 }
 const dayKey="2026-11-27",before=inventoryDataTree(beforeRoot,dayKey),after=inventoryDataTree(afterRoot,dayKey);
 const archiveRoot=noop?undefined:path.join(home,"archive");
 if(!noop)capturePrepostDeltaToIsolatedArchive(afterRoot,archiveRoot,before,after);
 const binding={dayKey,producerCommit:before.sourceCommit,runId:"123",runAttempt:1,sourceSha256:hash(source)};
 const row={id:"value.initial",scope:dayKey,status:"completed",exitCode:0,signal:null,startedAtMs:10,completedAtMs:20,inputManifestSha256:before.manifestSha256,outputManifestSha256:after.manifestSha256,deltaManifestSha256:hash(JSON.stringify(compareDataInventories(before,after)))};
 const receipt=createInvocationReceiptCandidate({binding,source,census,row});
 fn({binding,source,census,receipt,beforeRoot,afterRoot,archiveRoot,row});
 }finally{fs.rmSync(home,{recursive:true,force:true});}
}
test("receipt verifies exact pre/post bytes and add modify delete payload",()=>fixture(f=>{
 const a=auditInvocationManifestBytes(f);assert.equal(a.accepted,true,a.reason);assert.deepEqual([a.added,a.modified,a.deleted],[1,1,1]);
 assert.equal(a.manifestBytesVerified,true);assert.equal(a.deltaPayloadVerified,true);
 for(const k of ["runtimeAttested","writerQuiescenceAttested","checkpointReusable","resumeAuthorized","publicationAuthorized"])assert.equal(a[k],false);
}));
test("preimage and unchanged postimage tampering rejected",()=>fixture(f=>{
 fs.writeFileSync(path.join(f.beforeRoot,"data/value/stable.json"),"tampered");
 assert.equal(auditInvocationManifestBytes(f).accepted,false);
}));
test("postimage tampering rejected",()=>fixture(f=>{
 fs.writeFileSync(path.join(f.afterRoot,"data/value/stable.json"),"tampered");
 assert.equal(auditInvocationManifestBytes(f).accepted,false);
}));
test("delta archive tampering rejected",()=>fixture(f=>{
 fs.writeFileSync(path.join(f.archiveRoot,"files/data/value/add.json"),"tampered");
 assert.equal(auditInvocationManifestBytes(f).reason,"receipt_delta_archive_invalid");
}));
test("validly rehashed receipt with wrong delta digest rejected",()=>fixture(f=>{
 const receipt=createInvocationReceiptCandidate({...f,row:{...f.row,deltaManifestSha256:"f".repeat(64)}});
 assert.equal(auditInvocationManifestBytes({...f,receipt}).reason,"receipt_delta_digest_mismatch");
}));
test("same root and missing archive rejected",()=>fixture(f=>{
 assert.equal(auditInvocationManifestBytes({...f,afterRoot:f.beforeRoot}).reason,"receipt_evidence_roots_not_independent");
 assert.equal(auditInvocationManifestBytes({...f,archiveRoot:undefined}).accepted,false);
}));
test("byte-identical no-op verified without archive or authority",()=>fixture(f=>{
 const a=auditInvocationManifestBytes(f);assert.equal(a.accepted,true,a.reason);assert.equal(a.verifiedNoop,true);
 assert.equal(a.deltaPayloadVerified,false);assert.equal(a.checkpointReusable,false);
},true));
