import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { preflightResultsWriteSet as check } from "./preflight-results-write-set-sandbox.js";
const sha=b=>createHash("sha256").update(b).digest("hex");
function scenario(body) {
 const root=mkdtempSync(join(tmpdir(),"aiml-preflight-"));
 try {
  const entries=[],candidates={};
  for (const slug of ["eng.1","nor.1"]) {
   const p="data/league-memory/results/"+slug+".json";
   const a=Buffer.from(JSON.stringify({slug,teams:{}}));
   const b=Buffer.from(JSON.stringify({slug,teams:{Home:[{matchId:slug,ha:"H",gf:1,ga:0}]}}));
   mkdirSync(join(root,"data","league-memory","results"),{recursive:true});
   writeFileSync(join(root,p),a);
   entries.push({path:p,status:"M",beforeSha256:sha(a),afterSha256:sha(b)});
   candidates[p]=b;
  }
  const manifest={schema:"ai-matchlab.results-write-set.v1",entries};
  return body({root,manifest,candidates});
 } finally {rmSync(root,{recursive:true,force:true});}
}
test("multi-path read-only preflight proves exact hashes without writes",()=>{
 scenario(({root,manifest,candidates})=>{
  const a=readFileSync(join(root,manifest.entries[0].path));
  const outcome=check({root,manifest,candidates});
  assert.equal(outcome.ok,true);assert.equal(outcome.readOnly,true);assert.equal(outcome.approved,false);
  assert.equal(outcome.hashes.length,2);
  assert.deepEqual(readFileSync(join(root,manifest.entries[0].path)),a);
 });
});
test("whole preflight fails when second candidate hash differs, without writes",()=>{
 scenario(({root,manifest,candidates})=>{
  const p=manifest.entries[1].path,a=readFileSync(join(root,p));
  candidates[p]=Buffer.from("tampered");
  assert.throws(()=>check({root,manifest,candidates}),/sandbox_preflight_hash_mismatch/);
  assert.deepEqual(readFileSync(join(root,p)),a);
 });
});
test("extra candidate, missing candidate and forged source hash fail closed",()=>{
 scenario(({root,manifest,candidates})=>{
  assert.throws(()=>check({root,manifest,candidates:{...candidates,"data/league-memory/results/extra.json":Buffer.from("x")}}),/scope_mismatch/);
  const partial={...candidates};delete partial[manifest.entries[0].path];
  assert.throws(()=>check({root,manifest,candidates:partial}),/candidate_missing/);
  manifest.entries[0].beforeSha256="a".repeat(64);
  assert.throws(()=>check({root,manifest,candidates}),/hash_mismatch/);
 });
});
