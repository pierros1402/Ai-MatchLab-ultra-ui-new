import test from "node:test";
import assert from "node:assert/strict";
import {buildHistoricalIdentityAdjudicationRegister} from "./build-historical-identity-adjudication-register.js";
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
