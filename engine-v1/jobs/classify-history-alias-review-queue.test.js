import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAliasReviewQueue as classify} from './classify-history-alias-review-queue.js';

const alias=(bindingStatus,memoryProof)=>({row:{id:'source',leagueSlug:'league'},result:{ok:true,canonicalId:'target',requiresIndependentIdentityApproval:true},bindingStatus,memoryProof,identityApproval:false});
const report=(candidates,n)=>({schema:'aiml.history-event-alias-audit.v1',writeAuthorized:false,counts:{ALIAS_CANDIDATE:n},candidates});
test('all evidence tiers preserve review-only authority',()=>{
 const rows=[alias('VERIFIED_PROVIDER_BINDING','EXACT_RECIPROCAL_MEMORY'),alias('VERIFIED_PROVIDER_BINDING','NO_MEMORY'),alias('UNVERIFIED','EXACT_RECIPROCAL_MEMORY'),alias('UNVERIFIED','NO_MEMORY'),{row:{id:'conflict'},result:{ok:false,reason:'SCORE_CONFLICT'}}];
 const r=classify(report(rows,4));
 assert.deepEqual(r.queue.map(x=>x.category),['PROVIDER_AND_MEMORY_REVIEW','PROVIDER_BINDING_REVIEW','MEMORY_CORROBORATION_REVIEW','INDEPENDENT_IDENTITY_EVIDENCE_REQUIRED','CONFLICT_REVIEW']);
 assert.equal(r.aliasCount,4);assert.equal(r.reviewCount,5);assert.equal(r.approvedCount,0);assert.equal(r.writeAuthorized,false);
 assert.ok(r.queue.every(x=>x.identityApproval===false&&x.writeAuthorized===false));
 assert.deepEqual(r.queue.map(x=>x.evidence),rows);
});
test('rejects inconsistent candidate census',()=>assert.throws(()=>classify(report([alias('UNVERIFIED','NO_MEMORY')],0)),/alias_count_mismatch/));
test('rejects write-authorized source audit',()=>assert.throws(()=>classify({...report([],0),writeAuthorized:true}),/invalid_alias_audit/));
test('rejects preapproved aliases',()=>assert.throws(()=>classify(report([{...alias('VERIFIED_PROVIDER_BINDING','EXACT_RECIPROCAL_MEMORY'),identityApproval:true}],1)),/unexpected_alias_approval/));
test('empty census is explicitly review-only',()=>assert.deepEqual(classify(report([],0)).queue,[]));
