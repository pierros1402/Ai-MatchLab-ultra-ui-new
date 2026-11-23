import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {inspectResultsMemoryWriter,summarizeResultsMemoryRows}
  from "./audit-stage20-results-memory-custody.mjs";
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
test("results-memory source establishes append retention and downstream team FORM",()=>{
  const source=fs.readFileSync("engine-v1/storage/results-memory-db.js","utf8");
  const r=inspectResultsMemoryWriter(source);
  assert.equal(r.historyAccumulation,"per-league-append-with-retention");
  assert.equal(r.valueFormInput,true);
  assert.equal(r.stage20OmissionAuthorized,false);
  assert.equal(r.liveFeedRebuildEquivalenceProven,false);
});
test("source drift cannot silently approve rebuilding instead of baseline retention",()=>{
  const source=fs.readFileSync("engine-v1/storage/results-memory-db.js","utf8");
  assert.throws(()=>inspectResultsMemoryWriter(source.replace("applyMatchLevelRetention","removed")),
    /results_memory_source_contract_mismatch/);
});
test("source-bound league result payload counts teams and accumulated rows",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-form-memory-"));
  try{
    const name="data/league-memory/results/eng.1.json";
    const data=JSON.stringify({slug:"eng.1",teams:{Arsenal:[
      {matchId:"cid_a",canonicalId:"cid_a",date:"2026-11-20",opp:"Chelsea",gf:2,ga:1}
    ],Chelsea:[{matchId:"fs_1",date:"2026-11-20",opp:"Arsenal",gf:1,ga:2}]}});
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),data);
    const report=summarizeResultsMemoryRows([{path:name,bytes:Buffer.byteLength(data),sha256:sha(data)}],root);
    assert.deepEqual([report.files,report.validPayloads,report.teamKeys,report.resultRows],[1,1,2,2]);
    assert.equal(report.missingCanonicalIdRows,1);
    assert.equal(report.resultIdentityTruthIndependentlyVerified,false);
    assert.equal(report.omissionAuthorized,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("tampered results-memory bytes fail closed",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-form-byte-"));
  try{
    const p="data/league-memory/results/foo.json";
    fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});
    fs.writeFileSync(path.join(root,p),'{"teams":{}}');
    assert.throws(()=>summarizeResultsMemoryRows([
      {path:p,bytes:12,sha256:"a".repeat(64)}
    ],root),/results_memory_historical_bytes_mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("traversal and duplicate results paths refused",()=>{
  const root="/tmp";
  for(const p of ["data/league-memory/results/../secrets.json",
    "data/league-memory/results\\bad.json"])
    assert.throws(()=>summarizeResultsMemoryRows([{path:p}],root),/results_memory_path_invalid/);
  const same={path:"data/league-memory/results/foo.json"};
  assert.throws(()=>summarizeResultsMemoryRows([same,same],root),/results_memory_path_invalid/);
});
