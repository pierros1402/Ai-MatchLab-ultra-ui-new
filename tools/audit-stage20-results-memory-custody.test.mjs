import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {inspectStandingsMemoryWriter,summarizeStandingsMemoryRows}
  from "./audit-stage20-results-memory-custody.mjs";
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
test("real standings source is legacy research evidence, never automatic model truth",()=>{
  const source=fs.readFileSync("engine-v1/storage/standings-memory-db.js","utf8");
  const r=inspectStandingsMemoryWriter(source);
  assert.equal(r.role,"legacy-research-evidence-with-attempts");
  assert.equal(r.trustedStandingsGateRequired,true);
  assert.equal(r.productionModelTruthFromLegacyMemory,false);
  assert.equal(r.omissionAuthorized,false);
});
test("missing trusted standings boundary fails source provenance",()=>{
  const source=fs.readFileSync("engine-v1/storage/standings-memory-db.js","utf8");
  assert.throws(()=>inspectStandingsMemoryWriter(source.replace("readTrustedStandingsState(","renamedTrustedStandings(")),
    /standings_memory_source_contract_mismatch/);
});
test("synthetic standings evidence is counted without releasing legacy model-truth gate",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-standings-evidence-"));
  try{
    const name="data/league-memory/standings/eng.1.json";
    const content=JSON.stringify({slug:"eng.1",
      attempts:[{status:"accepted",confidence:0.9}],
      accepted:{season:"2026",confidence:0.9,rows:[{teamName:"Example",points:12}]}});
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),content);
    const r=summarizeStandingsMemoryRows([{
      path:name,bytes:Buffer.byteLength(content),sha256:sha(content)
    }],root);
    assert.deepEqual([r.files,r.validPayloads,r.acceptedSnapshots,r.attemptRecords,r.acceptedRows],[1,1,1,1,1]);
    assert.equal(r.modelTruthGateBypassed,false);
    assert.equal(r.productionStandingsTruthIndependentlyVerified,false);
    assert.equal(r.omissionAuthorized,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("unbound source byte mutation fails closed",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-standings-integrity-"));
  try{
    const name="data/league-memory/standings/a.json";
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),'{"attempts":[]}');
    assert.throws(()=>summarizeStandingsMemoryRows([{
      path:name,bytes:15,sha256:"0".repeat(64)
    }],root),/standings_memory_historical_bytes_mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("unsafe standings paths and duplicate files are denied",()=>{
  for(const name of [
    "data/league-memory/standings/../foo.json",
    "data/league-memory/standings\\foo.json"
  ])assert.throws(()=>summarizeStandingsMemoryRows([{path:name}],"/tmp"),
    /standings_memory_path_invalid/);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-standings-dupe-"));
  try{
    const name="data/league-memory/standings/a.json",content='{"attempts":[]}';
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),content);
    const record={path:name,bytes:Buffer.byteLength(content),sha256:sha(content)};
    assert.throws(()=>summarizeStandingsMemoryRows([record,record],root),
      /standings_memory_path_invalid/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
