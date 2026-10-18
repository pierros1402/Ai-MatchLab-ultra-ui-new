import test from 'node:test';
import assert from 'node:assert/strict';
import {contractWithPrimaryCount} from './prepare-primary-competition-contracts.js';
const original={competition:{slug:'esp.1'},contractVersion:1,season:{reference:'2025-2026'},authority:{status:'UNVERIFIED',scopes:[]},teamCount:{rule:{mode:'EXACT',value:20}}};
const proof={slug:'esp.1',season:'2026-2027',count:20,verifiedScope:'TEAM_COUNT',publisher:'LALIGA',retrievedAt:'2026-10-18T10:00Z',url:'https://www.laliga.com/en-DE/laliga-easports/clubs'};
test('primary proof updates only the verified count and season, preserving the preimage',()=>{
 const before=JSON.stringify(original),after=contractWithPrimaryCount(original,proof);
 assert.equal(after.season.reference,proof.season);assert.deepEqual(after.authority.scopes,['TEAM_COUNT']);assert.equal(JSON.stringify(original),before);
 assert.equal(contractWithPrimaryCount(after,proof),null);
 assert.throws(()=>contractWithPrimaryCount(after,{...proof,count:22}),/authority_conflict/);
 assert.throws(()=>contractWithPrimaryCount({...original,authority:{scopes:['PHASE_STRUCTURE']}},proof),/other_scopes/);
 assert.throws(()=>contractWithPrimaryCount(original,{...proof,slug:'eng.1'}),/identity_mismatch/);
});
