import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { auditHistorical954 } from "./audit-daily954-stage20-history.mjs";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-history-"));
  const files=[
    ["data/value/2026-11-23.json","{}\n"],
    ["data/odds-memory/day.json","{\"assessment\":true}\n"],
    ["data/history-recovery-journal/2026-11-22.json","[]\n"]
  ];
  try {
    for(const [name,contents] of files){
      fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
      fs.writeFileSync(path.join(root,name),contents);
    }
    const pin={dayKey:"2026-11-23",runId:"123",attempt:1,sourceCommit:"a".repeat(40),
      baselineCommit:"b".repeat(40),count:3,bytes:files.reduce((a,x)=>a+Buffer.byteLength(x[1]),0)};
    const doc={...pin,scope:"changes_and_untracked_evidence",purpose:"recovery_evidence_only",
      publicationApproved:false,absentPaths:[],
      files:files.map(([name,content])=>({path:name,bytes:Buffer.byteLength(content),sha256:sha(content)}))};
    const bytes=Buffer.from(JSON.stringify(doc));
    fs.writeFileSync(path.join(root,"manifest.json"),bytes);
    pin.manifestSha256=sha(bytes);
    fn({root,pin,files});
  }finally { fs.rmSync(root,{recursive:true,force:true}); }
}
test("byte-exact inventory counts approved, denied and previous-day outputs",()=>fixture(x=>{
  const r=auditHistorical954(x.root,x.pin);
  assert.equal(r.files,3);
  assert.equal(r.admitted,1);
  assert.equal(r.denied,2);
  assert.equal(r.denyReasons.unapproved_family,2);
  assert.equal(r.datePathIndicators.other_day_path,1);
  assert.equal(r.completeStage20CaptureProven,false);
  assert.equal(r.ignoredFilesAudited,false);
  assert.equal(r.publicationApproved,false);
}));
test("missing file or altered bytes fail closed",()=>fixture(x=>{
  fs.writeFileSync(path.join(x.root,x.files[0][0]),"changed");
  assert.throws(()=>auditHistorical954(x.root,x.pin),/historical_file_integrity_mismatch/);
}));
test("unexpected extra physical file fails closed",()=>fixture(x=>{
  fs.writeFileSync(path.join(x.root,"data/value/extra.json"),"{}");
  assert.throws(()=>auditHistorical954(x.root,x.pin),/historical_extra_or_missing_files/);
}));
test("manifest alteration is rejected by pinned SHA",()=>fixture(x=>{
  const f=path.join(x.root,"manifest.json");
  fs.appendFileSync(f,"\n");
  assert.throws(()=>auditHistorical954(x.root,x.pin),/historical_manifest_sha_mismatch/);
}));
test("source-commit mismatch fails even with valid manifest hash",()=>fixture(x=>{
  const f=path.join(x.root,"manifest.json");
  const doc=JSON.parse(fs.readFileSync(f,"utf8"));doc.sourceCommit="c".repeat(40);
  const bytes=Buffer.from(JSON.stringify(doc));fs.writeFileSync(f,bytes);
  const pin={...x.pin,manifestSha256:sha(bytes)};
  assert.throws(()=>auditHistorical954(x.root,pin),/historical_source_binding_mismatch/);
}));
test("symlink in archive rejected",()=>fixture(x=>{
  const source=path.join(x.root,x.files[0][0]);
  fs.unlinkSync(source);
  fs.symlinkSync(path.join(x.root,x.files[1][0]),source);
  assert.throws(()=>auditHistorical954(x.root,x.pin),/historical_inventory_symlink/);
}));
test("duplicate tombstone is never accepted",()=>fixture(x=>{
  const f=path.join(x.root,"manifest.json");
  const doc=JSON.parse(fs.readFileSync(f,"utf8"));
  doc.absentPaths=["data/value/old.json","data/value/old.json"];
  const bytes=Buffer.from(JSON.stringify(doc));fs.writeFileSync(f,bytes);
  assert.throws(()=>auditHistorical954(x.root,{...x.pin,manifestSha256:sha(bytes)}),/historical_absent_paths_invalid/);
}));
test("denied sensitive key is counted without exposing its value or filename",()=>fixture(x=>{
  const target=path.join(x.root,"data/odds-memory/day.json");
  const marker="SYNTHETIC_NON_SECRET_TEST_VALUE";
  const raw=JSON.stringify({api_key:marker});
  fs.writeFileSync(target,raw);
  const file=path.join(x.root,"manifest.json");
  const doc=JSON.parse(fs.readFileSync(file,"utf8"));
  const row=doc.files.find(r=>r.path==="data/odds-memory/day.json");
  row.bytes=Buffer.byteLength(raw);
  row.sha256=sha(raw);
  const bytes=Buffer.from(JSON.stringify(doc));
  fs.writeFileSync(file,bytes);
  const pin={...x.pin,manifestSha256:sha(bytes),
    bytes:x.pin.bytes-Buffer.byteLength(x.files[1][1])+Buffer.byteLength(raw)};
  const r=auditHistorical954(x.root,pin);
  assert.equal(r.deniedContentSummary.suspiciousFieldCandidates,1);
  assert.equal(r.deniedContentSummary.jsonParseFailures,0);
  assert.equal(r.sensitiveContentApproval,false);
  assert.ok(!JSON.stringify(r).includes(marker));
  assert.ok(!JSON.stringify(r).includes("data/odds-memory/day.json"));
}));
