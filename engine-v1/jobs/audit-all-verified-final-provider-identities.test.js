import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {auditAllVerifiedFinalProviderIdentities} from "./audit-all-verified-final-provider-identities.js";

function withHistory(run) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"aiml-all-final-audit-"));
 try {
  execFileSync("git",["init","-q"],{cwd:root});
  const add=(day,id,sources)=>{
   const folder=path.join(root,"data","final-results",day);
   fs.mkdirSync(folder,{recursive:true});
   const filename=path.join(folder,id+".json");
   fs.writeFileSync(filename,JSON.stringify({matchId:id,dayKey:day,verifiedFinalTruth:true,sources}));
  };
  run({root,add,stage:()=>execFileSync("git",["add","."],{cwd:root})});
 } finally {fs.rmSync(root,{recursive:true,force:true});}
}
test("all-history audit detects same provider fixture across distant months",()=>{
 withHistory(({root,add,stage})=>{
  const provider=[{provider:"espn",providerMatchId:"id-778899"}];
  add("2026-01-15","cid_old",provider);
  add("2026-10-29","cid_new",provider);
  stage();
  const before=fs.readFileSync(path.join(root,"data","final-results","2026-01-15","cid_old.json"));
  const report=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(report.ok,false);
  assert.equal(report.checked,2);
  assert.equal(report.duplicateCount,1);
  assert.equal(report.duplicates[0].providerMatchId,"id-778899");
  assert.deepEqual(fs.readFileSync(path.join(root,"data","final-results","2026-01-15","cid_old.json")),before);
 });
});
test("all-history audit accepts unique providers but flags unverifiable source evidence",()=>{
 withHistory(({root,add,stage})=>{
  add("2026-10-28","cid_one",[{provider:"espn",providerMatchId:"unique-1"}]);
  add("2026-10-29","cid_two",[{provider:"espn",providerMatchId:"unique-2"}]);
  stage();
  const valid=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(valid.ok,true);
  assert.equal(valid.uniqueProviderMatches,2);
  add("2026-10-30","cid_missing",undefined);
  stage();
  const invalid=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(invalid.ok,false);
  assert.equal(invalid.unverifiableCount,1);
 });
});
