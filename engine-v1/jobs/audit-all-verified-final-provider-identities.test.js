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

test("historical score classification distinguishes agreement, conflict and unknown",()=>{
 withHistory(({root,add,stage})=>{
  const cases=[["same",2,1,2,1],["conflict",2,1,3,1],["unknown",2,1,null,null]];
  for(const [key,h1,a1,h2,a2] of cases) {
   for(const [day,id,h,a] of [["2026-01-15",key+"_a",h1,a1],["2026-10-29",key+"_b",h2,a2]]) {
    add(day,id,[{provider:"espn",providerMatchId:key}]);
    const file=path.join(root,"data","final-results",day,id+".json");
    const doc=JSON.parse(fs.readFileSync(file,"utf8"));
    if(h!==null){doc.homeScore=h;doc.awayScore=a;}
    fs.writeFileSync(file,JSON.stringify(doc));
   }
  }
  stage();
  const report=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(report.duplicateCount,3);
  assert.equal(report.scoreAgreementCount,1);
  assert.equal(report.scoreConflictCount,1);
  assert.equal(report.scoreUnverifiableCount,1);
 });
});

test("historical identity audit retains conflicting kickoff and terminal provenance",()=>{
 withHistory(({root,add,stage})=>{
  const src={provider:"flashscore",providerMatchId:"fixture-77"};
  add("2026-07-18","cid_early",[{...src,scoreHome:0,scoreAway:0}]);
  add("2026-10-03","cid_late",[{...src,finished:true,playedFinal:true,scoreHome:3,scoreAway:0}]);
  for(const [day,id,score,kickoff] of [
    ["2026-07-18","cid_early",[0,0],"2026-07-18T16:30:00.000Z"],
    ["2026-10-03","cid_late",[3,0],"2026-10-03T18:00:00.000Z"]]) {
    const file=path.join(root,"data","final-results",day,id+".json");
    const doc=JSON.parse(fs.readFileSync(file,"utf8"));
    doc.homeScore=score[0];doc.awayScore=score[1];doc.kickoffUtc=kickoff;
    fs.writeFileSync(file,JSON.stringify(doc));
  }
  stage();
  const result=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(result.duplicateCount,1);
  assert.equal(result.scoreConflictCount,1);
  assert.equal(result.kickoffDisagreementCount,1);
  assert.equal(result.ambiguousTerminalEvidenceCount,1);
  assert.equal(result.duplicates[0].identityAdjudicationRequired,true);
  assert.equal(result.duplicates[0].firstProviderTerminal,false);
  assert.equal(result.duplicates[0].secondProviderTerminal,true);
 });
});

test("empty provider source arrays cannot falsely pass historical identity coverage",()=>{
 withHistory(({root,add,stage})=>{
  add("2026-10-29","cid_no_provider",[]);
  stage();
  const result=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(result.ok,false);
  assert.equal(result.checked,1);
  assert.equal(result.duplicateCount,0);
  assert.equal(result.unverifiableCount,1);
  assert.equal(result.unverifiable[0].reason,"provider_identity_evidence_missing");
 });
});

test("legacy exact Flashscore authority is recognized but unsupported repair authority remains on hold",()=>{
 withHistory(({root,add,stage})=>{
  add("2026-08-07","cid_legacy",[{authority:"flashscore",providerMatchId:"zXY011"}]);
  add("2026-08-08","cid_regular",[{provider:"flashscore",providerMatchId:"zXY011"}]);
  add("2026-08-09","cid_unproven",[{authority:"prior_repair_independent_source_1",reference:"old transcript"}]);
  stage();
  const result=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(result.duplicateCount,1);
  assert.equal(result.unverifiableCount,1);
  assert.equal(result.unverifiable[0].reason,"provider_identity_evidence_missing");
  assert.equal(result.duplicates[0].provider,"flashscore");
 });
});

test("legacy adjudication provenance is retained but cannot qualify a missing provider identity",()=>{
 withHistory(({root,add,stage})=>{
  const day="2026-08-09",id="cid_recovered";
  add(day,id,[{authority:"prior_repair_independent_source_1",
    sourceLocatorMissing:true,reference:"recovered-session:historical"}]);
  const file=path.join(root,"data","final-results",day,id+".json");
  const doc=JSON.parse(fs.readFileSync(file,"utf8"));
  doc.finalTruthAdjudication={adjudicationId:"adj_123",state:"APPLIED"};
  fs.writeFileSync(file,JSON.stringify(doc));
  stage();
  const report=auditAllVerifiedFinalProviderIdentities(root);
  assert.equal(report.ok,false);
  assert.equal(report.unverifiableCount,1);
  assert.deepEqual(report.unverifiable[0],{
    path:"data/final-results/2026-08-09/cid_recovered.json",
    reason:"provider_identity_evidence_missing",adjudicationId:"adj_123",
    adjudicationState:"APPLIED",historicalEvidenceCount:1,
    missingSourceLocators:1,independentProviderIdentityQualified:false,
    sourceReverificationRequired:true
  });
 });
});
