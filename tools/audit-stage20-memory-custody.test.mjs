import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {inspectMemorySourceContracts,analyzeMemoryDocuments} from "./audit-stage20-memory-custody.mjs";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
test("real source owners are bound to frozen opening and persisted league state",()=>{
  const odds=fs.readFileSync("engine-v1/storage/odds-memory-db.js","utf8");
  const league=fs.readFileSync("engine-v1/storage/league-memory-db.js","utf8");
  const r=inspectMemorySourceContracts(odds,league);
  assert.equal(r.oddsOpeningMutability,"frozen-at-first-capture");
  assert.equal(r.equivalentReconstructionProven,false);
  assert.equal(r.omissionAuthorized,false);
  assert.equal(r.resumeAuthorized,false);
});
test("source contract drift rejects unsafe memory omission planning",()=>{
  const odds=fs.readFileSync("engine-v1/storage/odds-memory-db.js","utf8");
  const league=fs.readFileSync("engine-v1/storage/league-memory-db.js","utf8");
  assert.throws(()=>inspectMemorySourceContracts(odds.replaceAll("existing.open","no-opening"),league),
    /stage20_memory_source_contract_changed/);
});
test("synthetic odds openings and league state tracked but no drop authorized",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-memory-audit-"));
  try{
    const content=[
      ["data/odds-memory/test.json",JSON.stringify({markets:{"1X2":{open:{home:1.5}}},aiAssessment:{markets:{}}})],
      ["data/league-memory/state.json",JSON.stringify({eng:{state:"active"}})]
    ];
    for(const [name,bytes] of content){
      fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
      fs.writeFileSync(path.join(root,name),bytes);
    }
    const rows=content.map(([name,bytes])=>({path:name,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}));
    const r=analyzeMemoryDocuments(rows,root);
    assert.deepEqual([r.oddsFiles,r.leagueFiles,r.oddsWithOpening,r.oddsWithAssessment],[1,1,1,1]);
    assert.equal(r.leagueStateDocuments,1);
    assert.equal(r.dropMemoryAllowed,false);
    assert.equal(r.fullMemoryBaselineNeededForByteExactReplay,true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test("out-of-scope data path fails closed",()=>{
  assert.throws(()=>analyzeMemoryDocuments([{path:"data/../secret.json",bytes:0,sha256:sha("")}],"/tmp"),
    /stage20_memory_unsafe_path/);
});
test("tampered historical record bytes fail source-bound check",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-memory-tamper-"));
  try{
    fs.mkdirSync(path.join(root,"data/odds-memory"),{recursive:true});
    fs.writeFileSync(path.join(root,"data/odds-memory/a.json"),"{}");
    assert.throws(()=>analyzeMemoryDocuments([
      {path:"data/odds-memory/a.json",bytes:2,sha256:"0".repeat(64)}
    ],root),/stage20_memory_source_bytes_changed/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
