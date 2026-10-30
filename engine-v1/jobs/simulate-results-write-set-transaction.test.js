import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {simulateResultsWriteSetTransaction as run} from "./simulate-results-write-set-transaction.js";
const hash=b=>createHash("sha256").update(b).digest("hex");
function setup(callback){
 const root=mkdtempSync(join(tmpdir(),"aiml-transaction-test-"));
 try {
  const base=join(root,"data","league-memory","results");
  mkdirSync(base,{recursive:true});
  const entries=[],candidates={};
  for(const slug of ["eng.1","nor.1","grc.1"]) {
   const path="data/league-memory/results/"+slug+".json";
   const old=Buffer.from(JSON.stringify({slug,teams:{}}));
   const newer=Buffer.from(JSON.stringify({slug,teams:{Home:[{matchId:slug,ha:"H",gf:1,ga:0}]}}));
   writeFileSync(join(root,path),old);
   entries.push({path,status:"M",beforeSha256:hash(old),afterSha256:hash(newer)});
   candidates[path]=newer;
  }
  const manifest={schema:"ai-matchlab.results-write-set.v1",entries};
  callback({root,manifest,candidates});
  for(const e of entries)assert.equal(hash(readFileSync(join(root,e.path))),e.beforeSha256);
 }finally{rmSync(root,{recursive:true,force:true});}
}
test("three-file simulation applies and verifies atomically without source changes",()=>{
 setup(args=>{
  const r=run(args);
  assert.deepEqual({ok:r.ok,applied:r.applied,sourceUnchanged:r.sourceUnchanged,
    productionWrites:r.productionWrites,privateStateVerified:r.privateStateVerified},{ok:true,applied:3,sourceUnchanged:true,productionWrites:0,privateStateVerified:true});
 });
});
test("injected failure after one write rolls back every staged file",()=>{
 setup(args=>{
  const r=run({...args,injectFailureAfter:1});
  assert.equal(r.ok,false);assert.equal(r.rolledBack,true);
  assert.equal(r.rollbackVerified,true);assert.equal(r.privateStateVerified,true);assert.equal(r.applied,0);
  assert.equal(r.sourceUnchanged,true);
 });
});
test("injected failure before first write is also rollback-safe",()=>{
 setup(args=>{
  const r=run({...args,injectFailureAfter:0});
  assert.equal(r.ok,false);assert.equal(r.rollbackVerified,true);assert.equal(r.privateStateVerified,true);
 });
});
test("tampered candidate fails preflight without any writes",()=>{
 setup(args=>{
  args.candidates[args.manifest.entries[2].path]=Buffer.from("tampered");
  assert.throws(()=>run(args),/sandbox_preflight_hash_mismatch/);
 });
});

test("injected failure after two writes restores every candidate and leaves source intact",()=>{
 setup(args=>{
  const r=run({...args,injectFailureAfter:2});
  assert.equal(r.ok,false);
  assert.equal(r.applied,0);
  assert.equal(r.rolledBack,true);
  assert.equal(r.rollbackVerified,true);
  assert.equal(r.privateStateVerified,true);
  assert.equal(r.sourceUnchanged,true);
  assert.equal(r.productionWrites,0);
 });
});
test("failure at final write boundary restores all three pre-existing bytes",()=>{
 setup(args=>{
  const r=run({...args,injectFailureAfter:3});
  assert.equal(r.ok,false);
  assert.equal(r.applied,0);
  assert.equal(r.rolledBack,true);
  assert.equal(r.rollbackVerified,true);
  assert.equal(r.sourceUnchanged,true);
 });
});
