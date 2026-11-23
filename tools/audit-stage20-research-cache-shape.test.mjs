import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {classifyResearchCacheRows} from "./audit-stage20-research-cache-shape.mjs";
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function fixture(fn){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-stage20-research-"));
  const rows=[
    {path:"data/research-cache/2026-11-23/"+hash("one")+".json",raw:'{"ok":true}\n'},
    {path:"data/research-cache/other/cid_test_20261123.json",raw:'[1,2]\n'},
    {path:"data/research-cache/day.json",raw:'null\n'}
  ];
  try{
    for(const row of rows){
      const f=path.join(root,row.path);
      fs.mkdirSync(path.dirname(f),{recursive:true});
      fs.writeFileSync(f,row.raw);
      row.bytes=Buffer.byteLength(row.raw);
    }
    fn(root,rows);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test("aggregate JSON classes and basename shapes without filenames or values",()=>fixture((root,rows)=>{
  const r=classifyResearchCacheRows(rows,root,{expected:3});
  assert.equal(r.researchCacheFiles,3);
  assert.equal(r.validJson,3);
  assert.equal(r.jsonKinds.array,1);
  assert.equal(r.jsonKinds.object,1);
  assert.equal(r.jsonKinds.null,1);
  assert.equal(r.basenameKinds.sha256,1);
  assert.equal(r.basenameKinds["canonical-id"],1);
  assert.equal(r.filesWithEmbeddedDay,1);
  assert.equal(r.reconstructibleProven,false);
  assert.equal(r.omissionAuthorized,false);
  assert.ok(!JSON.stringify(r).includes(rows[1].path));
}));
test("incorrect expected count denied",()=>fixture((root,rows)=>{
  assert.throws(()=>classifyResearchCacheRows(rows,root,{expected:349}),/research_cache_count_mismatch/);
}));
test("unknown path traversal denied",()=>fixture((root,rows)=>{
  rows[1].path="data/research-cache/../outside.json";
  assert.throws(()=>classifyResearchCacheRows(rows,root,{expected:3}),/research_cache_unsafe_path/);
}));
test("duplicate filenames denied",()=>fixture((root,rows)=>{
  rows[1].path=rows[0].path;
  assert.throws(()=>classifyResearchCacheRows(rows,root,{expected:3}),/research_cache_duplicate_or_invalid/);
}));
test("changed file bytes denied",()=>fixture((root,rows)=>{
  fs.appendFileSync(path.join(root,rows[0].path),"x");
  assert.throws(()=>classifyResearchCacheRows(rows,root,{expected:3}),/research_cache_length_changed/);
}));
test("unparseable JSON counted, never treated as safe to omit",()=>fixture((root,rows)=>{
  const file=path.join(root,rows[2].path);fs.writeFileSync(file,"{bad");
  rows[2].bytes=4;
  const result=classifyResearchCacheRows(rows,root,{expected:3});
  assert.equal(result.invalidJson,1);
  assert.equal(result.omissionAuthorized,false);
}));
test("unsupported binary extension is counted without parsing",()=>fixture((root,rows)=>{
  const old=path.join(root,rows[2].path);
  const dest=path.join(root,"data/research-cache/a.bin");
  fs.renameSync(old,dest);
  rows[2].path="data/research-cache/a.bin";
  const r=classifyResearchCacheRows(rows,root,{expected:3});
  assert.equal(r.binaryOrUnsupported,1);
  assert.equal(r.stage20FamilyApproved,false);
}));
