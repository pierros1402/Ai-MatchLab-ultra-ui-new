import {execFileSync} from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import {buildHistoricalIdentityAdjudicationRegister,findCanonicalAuthorityForCase,inventoryAliasDependencies} from "./build-historical-identity-adjudication-register.js";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const audit={readOnly:true,trackedFinalFiles:100,unverifiable:[],duplicates:[
 {provider:"flashscore",providerMatchId:"fixture-A",firstPath:"a.json",secondPath:"b.json",
 firstMatchId:"a",secondMatchId:"b",firstScore:[0,0],secondScore:[3,0],
 firstKickoffUtc:"2026-07-18T12:00:00Z",secondKickoffUtc:"2026-10-03T12:00:00Z",
 scoreAgreement:false,kickoffAgreement:false,firstProviderTerminal:false,secondProviderTerminal:true}
]};
test("register is deterministic and cannot authorize settlement or overwrite",()=>{
 const first=buildHistoricalIdentityAdjudicationRegister(audit);
 const again=buildHistoricalIdentityAdjudicationRegister(audit);
 assert.deepEqual(first,again);
 assert.equal(first.duplicateCases,1);
 assert.equal(first.cases[0].classification,"SCORE_CONFLICT");
 assert.equal(first.cases[0].disposition,"HOLD_FOR_SOURCE_ADJUDICATION");
 assert.equal(first.cases[0].canonicalRetainedId,null);
 assert.equal(first.approvedForWrite,false);
 assert.equal(first.cases[0].approvedForWrite,false);
 assert.match(first.cases[0].caseId,/^HIST-[a-f0-9]{20}$/);
});
test("register rejects missing source audit evidence",()=>{
 assert.throws(()=>buildHistoricalIdentityAdjudicationRegister({duplicates:[],unverifiable:[]}),/source_audit_invalid/);
});

test("only matching final score and kickoff create a non-executable alias candidate",()=>{
 const source={...audit,duplicates:[
  {...audit.duplicates[0],providerMatchId:"safe",firstScore:[1,1],
   secondScore:[1,1],scoreAgreement:true,kickoffAgreement:true,
   firstKickoffUtc:"2026-08-01T12:00:00Z",
   secondKickoffUtc:"2026-08-01T12:00:00Z"},
  {...audit.duplicates[0],providerMatchId:"unsafe",scoreAgreement:false,
   kickoffAgreement:true}
 ]};
 const result=buildHistoricalIdentityAdjudicationRegister(source);
 const safe=result.cases.find(x=>x.evidence.providerMatchId==="safe");
 const unsafe=result.cases.find(x=>x.evidence.providerMatchId==="unsafe");
 assert.equal(safe.evidenceState,"DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF");
 assert.equal(safe.candidateOperation.kind,"PROPOSE_ALIAS_RECONCILIATION");
 assert.equal(safe.candidateOperation.fromMatchId,null);
 assert.equal(safe.candidateOperation.toMatchId,null);
 assert.equal(safe.candidateOperation.approvedForWrite,false);
 assert.equal(unsafe.evidenceState,"CONTRADICTORY_TERMINAL_SCORE");
 assert.equal(unsafe.candidateOperation,null);
 assert.equal(result.approvedForWrite,false);
});

test("collision totals partition exactly and remain non-executable",()=>{
 const rows=[
  {...audit.duplicates[0],providerMatchId:"score"},
  {...audit.duplicates[0],providerMatchId:"kickoff",firstScore:[2,1],secondScore:[2,1],
   scoreAgreement:true,kickoffAgreement:false},
  {...audit.duplicates[0],providerMatchId:"candidate",firstScore:[2,1],secondScore:[2,1],
   scoreAgreement:true,kickoffAgreement:true},
  {...audit.duplicates[0],providerMatchId:"unknown",scoreAgreement:null,kickoffAgreement:null}
 ];
 const reg=buildHistoricalIdentityAdjudicationRegister({...audit,duplicates:rows});
 assert.equal(reg.duplicateCases,4);
 assert.deepEqual(reg.classificationCounts,{
  SCORE_CONFLICT:1,KICKOFF_CONFLICT:1,
  SAME_SCORE_IDENTITY_CONFLICT:1,INCOMPLETE_SCORE_EVIDENCE:1
 });
 assert.equal(reg.nonExecutableCandidateCount,1);
 assert.ok(reg.cases.every(x=>x.approvedForWrite===false));
 assert.ok(reg.cases.every(x=>x.canonicalRetainedId===null));
});

test("canonical authority must match exact provider and source ID",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-canonical-"));
 try {
  const dir=join(root,"data","canonical-fixtures","2026-08-15");
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"ita.coppa_italia.json"),JSON.stringify({fixtures:[
    {canonicalId:"cid_retained",source:"espn",sourceMatchId:"401881684"},
    {canonicalId:"cid_unrelated",source:"espn",sourceMatchId:"other"}
  ]}));
  const evidence={provider:"espn",providerMatchId:"401881684",
    firstPath:"data/final-results/2026-08-15/cid_retained.json",
    secondPath:"data/final-results/2026-08-15/cid_alias.json",
    firstMatchId:"cid_retained",secondMatchId:"cid_alias"};
  const result=findCanonicalAuthorityForCase(root,evidence);
  assert.equal(result.status,"CANONICAL_SOURCE_BOUND_CANDIDATE");
  assert.equal(result.canonicalId,"cid_retained");
  assert.equal(result.approvedForWrite,false);
  assert.equal(result.dependencyInventoryVerified,false);
  assert.equal(findCanonicalAuthorityForCase(root,{...evidence,providerMatchId:"wrong"}).status,
    "HOLD_CANONICAL_AMBIGUOUS_OR_MISSING");
 } finally {rmSync(root,{recursive:true,force:true});}
});

test("canonical authority inventory stays read-only and enumerates exact source-bound candidates",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-canonical-summary-"));
 try {
  const dir=join(root,"data","canonical-fixtures","2026-08-15");
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"ita.coppa_italia.json"),JSON.stringify({fixtures:[
   {canonicalId:"cid_retained",source:"espn",sourceMatchId:"401881684"}
  ]}));
  const row={...audit.duplicates[0],provider:"espn",providerMatchId:"401881684",
   firstPath:"data/final-results/2026-08-15/cid_retained.json",
   secondPath:"data/final-results/2026-08-15/cid_alias.json",
   firstMatchId:"cid_retained",secondMatchId:"cid_alias"};
  const report=buildHistoricalIdentityAdjudicationRegister({...audit,duplicates:[row]},root);
  assert.equal(report.canonicalAuthorityCounts.CANONICAL_SOURCE_BOUND_CANDIDATE,1);
  assert.equal(report.canonicalSourceBoundCases.length,1);
  assert.equal(report.canonicalSourceBoundCases[0].retainedCanonicalId,"cid_retained");
  assert.equal(report.canonicalSourceBoundCases[0].approvedForWrite,false);
  assert.equal(report.safelyScopedCanonicalCandidateCount,0);
  assert.equal(report.safelyScopedCanonicalCandidates.length,0);
  assert.equal(report.approvedForWrite,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("exact-score exact-kickoff provider match yields a non-authorized alias candidate",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-canonical-aliased-"));
 try {
  const dir=join(root,"data","canonical-fixtures","2026-08-15");
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"ita.coppa_italia.json"),JSON.stringify({fixtures:[
   {canonicalId:"cid_retained",source:"espn",sourceMatchId:"401881684"}
  ]}));
  execFileSync("git",["init","-q"],{cwd:root});
  const finals=join(root,"data","final-results","2026-08-15");
  mkdirSync(finals,{recursive:true});
  writeFileSync(join(finals,"cid_alias.json"),JSON.stringify({matchId:"cid_alias"}));
  execFileSync("git",["add","data"],{cwd:root});
  const row={...audit.duplicates[0],provider:"espn",providerMatchId:"401881684",
   firstPath:"data/final-results/2026-08-15/cid_retained.json",
   secondPath:"data/final-results/2026-08-15/cid_alias.json",
   firstMatchId:"cid_retained",secondMatchId:"cid_alias",
   firstScore:[1,0],secondScore:[1,0],scoreAgreement:true,kickoffAgreement:true};
  const report=buildHistoricalIdentityAdjudicationRegister({...audit,duplicates:[row]},root);
  assert.equal(report.safelyScopedCanonicalCandidateCount,1);
  assert.equal(report.safelyScopedCanonicalCandidates[0].retainedCanonicalId,"cid_retained");
  assert.equal(report.safelyScopedCanonicalCandidates[0].aliasCandidateId,"cid_alias");
  assert.equal(report.safelyScopedCanonicalCandidates[0].writeAuthorized,false);
  assert.equal(report.safelyScopedCanonicalCandidates[0].dependencyAudit.readOnly,true);
  assert.ok(report.safelyScopedCanonicalCandidates[0].dependencyAudit.fileCount>=1);
  const dependencies=report.safelyScopedCanonicalCandidates[0].dependencyAudit;
  assert.equal(dependencies.writeSetApproved,false);
  assert.equal(dependencies.automaticReplacementAuthorized,false);
  assert.ok(dependencies.references.every(x=>x.writeAuthorized===false));
  assert.ok(dependencies.references.every(x=>typeof x.prescribedAction==="string"));

 }finally{rmSync(root,{recursive:true,force:true});}
});

test("history indexes are rebuildable but retained historical truth stays immutable",()=>{
 const source=readFileSync(new URL("./build-historical-identity-adjudication-register.js",import.meta.url),"utf8");
 assert.match(source,/history-index/);
 assert.match(source,/IMMUTABLE_OR_SETTLEMENT/);
 assert.match(source,/DETERMINISTIC_REBUILD_REQUIRED/);
 assert.match(source,/PRESERVE_AND_RECONCILE_BY_APPEND/);
});

test("unresolved historical collisions prohibit an approved write set",()=>{
 const report=buildHistoricalIdentityAdjudicationRegister(audit);
 assert.equal(report.reconciliationGate.status,"HOLD_UNTIL_DEPENDENCIES_ADJUDICATED");
 assert.equal(report.reconciliationGate.unresolvedCases,1);
 assert.equal(report.reconciliationGate.approvedWriteActions,0);
 assert.equal(report.reconciliationGate.approvedForWrite,false);
 assert.ok(report.reconciliationGate.requiredEvidence.includes("full_regression"));
});

test("empty retained-id git grep is not an inventory failure",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-alias-empty-"));
 try {
  execFileSync("git",["init","-q"],{cwd:root});
  mkdirSync(join(root,"data"),{recursive:true});
  writeFileSync(join(root,"data","sample.json"),JSON.stringify({matchId:"legacy"}));
  execFileSync("git",["add","data"],{cwd:root});
  const x=inventoryAliasDependencies(root,"retained","legacy");
  assert.equal(x.fileCount,1);
  assert.equal(x.aliasOccurrenceCount,1);
  assert.equal(x.retainedOccurrenceCount,0);
  assert.equal(x.approvedForWrite,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});


test("missing canonical day is classified as missing evidence without write authority",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-missing-canonical-day-"));
 try {
  const evidence={provider:"espn",providerMatchId:"123",
   firstPath:"data/final-results/2026-07-13/cid_a.json",
   secondPath:"data/final-results/2026-07-13/cid_b.json",
   firstMatchId:"cid_a",secondMatchId:"cid_b"};
  const result=findCanonicalAuthorityForCase(root,evidence);
  assert.equal(result.status,"HOLD_CANONICAL_AMBIGUOUS_OR_MISSING");
  assert.equal(result.reason,"canonical_day_directory_missing");
  assert.deepEqual(result.matches,[]);
  assert.notEqual(result.approvedForWrite,true);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("malformed existing canonical evidence must still be unreadable, never accepted",()=>{
 const root=mkdtempSync(join(tmpdir(),"aiml-unreadable-canonical-day-"));
 try {
  const dir=join(root,"data","canonical-fixtures","2026-07-13");
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"broken.json"),"{invalid");
  const result=findCanonicalAuthorityForCase(root,{
   provider:"espn",providerMatchId:"123",
   firstPath:"data/final-results/2026-07-13/cid_a.json",
   secondPath:"data/final-results/2026-07-13/cid_b.json",
   firstMatchId:"cid_a",secondMatchId:"cid_b"});
  assert.equal(result.status,"HOLD_CANONICAL_EVIDENCE_UNREADABLE");
  assert.notEqual(result.approvedForWrite,true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
