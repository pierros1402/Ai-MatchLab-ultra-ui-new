import test from 'node:test';
import assert from 'node:assert/strict';
import { validateValuePublicationIntegrity } from './value-snapshot-integrity.js';
import { planAObservationSignature } from '../value/plan-a-observation.js';
const valid = () => ({ day:'2026-10-31',today:'2026-11-01',fixtures:[{canonicalId:'cid_one'}],
  value:{ok:true,date:'2026-10-31',source:'canonical_fixtures',count:1,picks:[{matchId:'cid_one'}],publicationAuthority:'frozen_plan_a_observation'},
  gate:{ok:true,valueFreshAgainstCanonical:true},
  audit:{ok:true,date:'2026-10-31',source:'canonical_fixtures',sourceContract:{canonicalOnly:true},fixtureUniverse:{count:1,canonicalIds:['cid_one']},universe:{approved:1},evaluationAccounting:{unaccountedFixtureCount:0,duplicateOutcomeCount:0},decisionInputEvidence:{targetDay:'2026-10-31'}}
});
test('valid evidence is deterministic, idempotent and never mutates frozen bytes',()=>{
 const input=valid(),before=JSON.stringify(input);
 assert.deepEqual(validateValuePublicationIntegrity(input),{ok:true,errors:[]});
 assert.deepEqual(validateValuePublicationIntegrity(input),{ok:true,errors:[]});
 assert.equal(JSON.stringify(input),before);
});
test('missing, malformed, cross-day, source-mismatched and count-mismatched audits fail closed',()=>{
 for(const mutate of [x=>x.audit=null,x=>x.audit=[],x=>x.audit={},x=>x.audit.date='2026-10-30',x=>x.audit.source='snapshot',x=>x.audit.universe.approved=7,x=>x.audit.decisionInputEvidence.targetDay='2026-11-01',x=>x.audit.evaluationAccounting.unaccountedFixtureCount=1]){
  const input=valid();mutate(input);assert.equal(validateValuePublicationIntegrity(input).ok,false);
 }
});
test('orphan, missing-ID, wrong-day and inconsistent-count picks fail despite a green gate',()=>{
 for(const mutate of [x=>x.value.date='2026-10-30',x=>x.value.count=7,x=>x.value.picks[0].matchId='other',x=>delete x.value.picks[0].matchId,x=>x.fixtures.push({canonicalId:'cid_one'}),x=>x.audit.fixtureUniverse.canonicalIds=['other']]){
  const input=valid();mutate(input);assert.equal(validateValuePublicationIntegrity(input).ok,false);
 }
});
test('historical first-freeze and stale current Value cannot become frozen by relabeling the top-level gate',()=>{
 const input=valid();input.value.publicationAuthority='current_value_artifact_first_freeze';
 assert.ok(validateValuePublicationIntegrity(input).errors.includes('historical_first_freeze_forbidden'));
 input.value.publicationAuthority='current_value_artifact';input.gate.valueFreshAgainstCanonical=false;
 assert.ok(validateValuePublicationIntegrity(input).errors.includes('stale_value_without_verified_frozen_binding'));
});

test('forged frozen metadata cannot waive stale Value without its exact original observation signature',()=>{
 const input=valid();Object.assign(input.value,{immutable:true,schema:'ai-matchlab.value-plan-a-observation.v1',observationSignature:'a'.repeat(64)});
 assert.ok(validateValuePublicationIntegrity(input).errors.includes('frozen_observation_signature_invalid'));
 input.value.observationSignature=planAObservationSignature(input.day,input.value);
 assert.equal(validateValuePublicationIntegrity(input).ok,true);
 input.value.picks[0].market='changed';
 assert.ok(validateValuePublicationIntegrity(input).errors.includes('frozen_observation_signature_invalid'));
});

test('timestamps independently reveal stale Value even when its declared freshness is green',()=>{
 const input=valid();input.value.updatedAt='2026-10-31T01:00:00Z';input.audit.generatedAt='2026-10-31T01:00:01Z';input.gate.latestCanonicalUpdatedAt='2026-11-01T01:00:00Z';
 assert.ok(validateValuePublicationIntegrity(input).errors.includes('stale_value_without_signed_observation'));
});
