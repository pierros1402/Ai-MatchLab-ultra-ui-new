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
