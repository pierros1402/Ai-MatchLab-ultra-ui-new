import test from "node:test";
import assert from "node:assert/strict";
import { sha256Canonical } from "../core/operational-memory/canonical-json.js";
import { deriveAuthorityFingerprint, deriveCaseId, deriveEvidenceFingerprint, deriveEventHash, deriveEventId, derivePayloadFingerprint, deriveProducerFingerprint, deriveRelationshipFingerprint, deriveSemanticHash, deriveSubjectFingerprint } from "../core/operational-memory/event-identity.js";
test("component fingerprints and case2 identity deterministic", () => {
  const producer = { producerId: "system", producerRole: "SYSTEM" };
  const subject = { scope: "SYSTEM", key: "system" };
  const payload = { observationClass: "test", severity: "INFO", summary: "ok", facts: [] };
  const evidenceRefs = [];
  const authority = { sourceWriteAuthorized:false,dataWriteAuthorized:false,workflowWriteAuthorized:false,commitAuthorized:false,pushAuthorized:false,deployAuthorized:false,productionMutationAuthorized:false,productionKernelEnabled:false };
  const relationships = { parentEventIds:[],causedByEventId:null,supersedesEventId:null,authorizationEventId:null,executionAttemptEventId:null,rollbackOfExecutionAttemptEventId:null,rollbackExecutionAttemptEventId:null,validityTargetEventId:null };
  assert.equal(deriveProducerFingerprint(producer), sha256Canonical(producer));
  assert.equal(deriveSubjectFingerprint(subject), sha256Canonical(subject));
  assert.equal(derivePayloadFingerprint(payload), sha256Canonical(payload));
  assert.equal(deriveEvidenceFingerprint(evidenceRefs), sha256Canonical([]));
  assert.equal(deriveAuthorityFingerprint(authority), sha256Canonical(authority));
  assert.equal(deriveRelationshipFingerprint(relationships), sha256Canonical(relationships));
  const caseIdentity = { schema:"ai-matchlab.operational-memory.case-identity.v2",caseType:"test",subjectFingerprint:deriveSubjectFingerprint(subject),triggerClass:"test",rootEffectiveAt:"2026-10-07T00:00:00Z",rootEvidenceFingerprint:deriveEvidenceFingerprint([]) };
  assert.match(deriveCaseId(caseIdentity), /^case2_[0-9a-f]{64}$/);
});
test("semanticHash om1 eventId and eventHash deterministic", () => {
  const base = { schema:"ai-matchlab.operational-memory.event.v4",eventType:"OBSERVATION",caseId:"case2_"+"a".repeat(64),effectiveAt:"2026-10-07T00:00:00Z",producerFingerprint:"1".repeat(64),subjectFingerprint:"2".repeat(64),payloadFingerprint:"3".repeat(64),evidenceFingerprint:"4".repeat(64),authorityFingerprint:"5".repeat(64),relationshipFingerprint:"6".repeat(64) };
  const h = deriveSemanticHash(base); assert.match(h,/^[0-9a-f]{64}$/); assert.equal(deriveEventId(h),"om1_"+h);
  const persisted={...base,eventId:"om1_"+h,semanticHash:h,eventHash:"0".repeat(64)};
  assert.equal(deriveEventHash(persisted),deriveEventHash({...persisted,eventHash:"f".repeat(64)}));
  assert.notEqual(deriveSemanticHash({...base,payloadFingerprint:"7".repeat(64)}),h);
  assert.notEqual(deriveSemanticHash({...base,schema:"ai-matchlab.operational-memory.event.v3"}),h);
});
