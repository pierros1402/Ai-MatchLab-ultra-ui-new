import test from "node:test";
import assert from "node:assert/strict";
import { AUTHORITY_SNAPSHOT_CONTRACT, CASE_IDENTITY_CONTRACT, EVENT_PAYLOAD_CONTRACTS, NESTED_PAYLOAD_SCHEMAS, OPERATIONAL_MEMORY_EVENT_SCHEMA, RELATIONSHIP_CONTRACT } from "../core/operational-memory/contract-v1.js";
import { deriveAuthorityFingerprint, deriveCaseId, deriveEvidenceFingerprint, deriveEventHash, deriveEventId, derivePayloadFingerprint, deriveProducerFingerprint, deriveRelationshipFingerprint, deriveSemanticHash, deriveSubjectFingerprint } from "../core/operational-memory/event-identity.js";
import { assertOperationalMemoryEvent, validateOperationalMemoryEvent } from "../core/operational-memory/event-validator.js";

function samplePrimitive(type, field="") {
  if (type==="BOOLEAN"||type==="BOOLEAN_ONLY") return false;
  if (type==="FINITE_NUMBER"||type==="NUMBER") return 1;
  if (type==="SHA256_HEX"||type==="STATE_FINGERPRINT") return "a".repeat(64);
  if (type==="GIT_SHA1") return "b".repeat(40);
  if (type==="CALENDAR_DAY") return "2026-10-07";
  if (type==="UTC_TIMESTAMP") return "2026-10-07T00:00:00Z";
  if (type==="EVIDENCE_REF_ID") return "ev1_"+"a".repeat(64);
  if (type==="CASE_ID") return "case2_"+"a".repeat(64);
  if (type==="CANONICAL_MATCH_ID") return "match:test";
  if (field.toLowerCase().includes("path")) return "engine-v1/test.js";
  return "test";
}
function sampleNamedSchema(name) {
  if (name==="FACT") return {key:"fact",valueType:"STRING",value:"ok"};
  if (name==="METRIC") return {key:"metric",value:1};
  if (name==="TARGET_SCOPE") return {scope:"SYSTEM",key:"system"};
  const spec=NESTED_PAYLOAD_SCHEMAS[name];
  if (!spec) return {};
  if (typeof spec.representation==="string"&&spec.representation.startsWith("array<")) {
    const item=spec.representation.slice(6,-1);
    if (name==="ERROR_SET") return [];
    if (item==="STRING") return ["test"];
    if (NESTED_PAYLOAD_SCHEMAS[item]) return [sampleNamedSchema(item)];
    return [];
  }
  const out={};
  for (const field of spec.required||[]) {
    if (spec[field+"Schema"]) out[field]=sampleNamedSchema(spec[field+"Schema"]);
    else if (spec[field+"Enum"]) out[field]=spec[field+"Enum"][0];
    else if (spec[field+"Type"]) out[field]=samplePrimitive(spec[field+"Type"],field);
    else if (field.endsWith("At")) out[field]="2026-10-07T00:00:00Z";
    else if (field.toLowerCase().includes("fingerprint")) out[field]="a".repeat(64);
    else if (field.toLowerCase().includes("evidencerefid")) out[field]=[];
    else if (field.toLowerCase().includes("paths")||field.toLowerCase().includes("set")) out[field]=[];
    else if (field==="scope") out[field]="SYSTEM";
    else if (field==="key") out[field]="system";
    else if (field==="value") out[field]="ok";
    else if (field==="retriable") out[field]=false;
    else out[field]="test";
  }
  if (name==="EVIDENCE_ASSESSMENT") Object.assign(out,{state:"SUPPORTS",summary:"ok",supportingEvidenceRefIds:[],contradictingEvidenceRefIds:[]});
  return out;
}
function samplePayload(eventType) {
  const spec=EVENT_PAYLOAD_CONTRACTS[eventType], out={};
  for (const field of spec.required) {
    if (spec[field+"Schema"]) out[field]=sampleNamedSchema(spec[field+"Schema"]);
    else if (spec[field+"Enum"]) out[field]=spec[field+"Enum"][0];
    else if (spec[field+"Type"]) out[field]=samplePrimitive(spec[field+"Type"],field);
    else if (field.endsWith("At")) out[field]="2026-10-07T00:00:00Z";
    else if (field.toLowerCase().includes("fingerprint")) out[field]="a".repeat(64);
    else if (["facts","metrics","errors","checks","preconditions","stopConditions","actualWriteSet","expectedWriteSet","preservationSet"].includes(field)) out[field]=[];
    else if (field==="targetScope"||field==="scope") out[field]={scope:"SYSTEM",key:"system"};
    else out[field]="test";
  }
  if (eventType==="OBSERVATION") Object.assign(out,{observationClass:"test",severity:"INFO",summary:"ok",facts:[]});
  if (eventType==="DIAGNOSIS") Object.assign(out,{diagnosisClass:"test",status:"CONFIRMED",summary:"ok",confidence:1,evidenceAssessment:sampleNamedSchema("EVIDENCE_ASSESSMENT")});
  if (eventType==="VALIDITY_CHANGE") Object.assign(out,{action:"INVALIDATE",reasonCode:"test",reason:"ok"});
  return out;
}
function relationshipsFor(eventType) {
  const r=Object.fromEntries(RELATIONSHIP_CONTRACT.fields.map((f)=>[f,f==="parentEventIds"?[]:null]));
  const dummy="om1_"+"a".repeat(64);
  if (["DIAGNOSIS","REPAIR_PLAN","AUTHORIZATION_RECORD","EXECUTION_ATTEMPT"].includes(eventType)) r.causedByEventId=dummy;
  if (eventType==="OUTCOME_VERIFICATION") r.executionAttemptEventId=dummy;
  if (eventType==="ROLLBACK_RECOVERY") { r.rollbackOfExecutionAttemptEventId=dummy; r.rollbackExecutionAttemptEventId="om1_"+"b".repeat(64); }
  if (eventType==="VALIDITY_CHANGE") r.validityTargetEventId=dummy;
  return r;
}
function makeEvent(eventType) {
  const effectiveAt="2026-10-07T00:00:00Z";
  const producer={producerId:"system",producerRole:"SYSTEM"};
  const subject={scope:"SYSTEM",key:"system"};
  const evidenceRefs=[];
  const authoritySnapshot=Object.fromEntries(AUTHORITY_SNAPSHOT_CONTRACT.requiredFields.map((f)=>[f,false]));
  const relationships=relationshipsFor(eventType);
  const payload=samplePayload(eventType);
  const producerFingerprint=deriveProducerFingerprint(producer);
  const subjectFingerprint=deriveSubjectFingerprint(subject);
  const payloadFingerprint=derivePayloadFingerprint(payload);
  const evidenceFingerprint=deriveEvidenceFingerprint(evidenceRefs);
  const authorityFingerprint=deriveAuthorityFingerprint(authoritySnapshot);
  const relationshipFingerprint=deriveRelationshipFingerprint(relationships);
  const caseIdentity={schema:CASE_IDENTITY_CONTRACT.schema,caseType:"test",subjectFingerprint,triggerClass:"test",rootEffectiveAt:effectiveAt,rootEvidenceFingerprint:evidenceFingerprint};
  const event={schema:OPERATIONAL_MEMORY_EVENT_SCHEMA,eventId:"om1_"+"0".repeat(64),eventType,caseId:deriveCaseId(caseIdentity),caseIdentity,effectiveAt,effectiveUtcDay:"2026-10-07",recordedAt:effectiveAt,producer,producerFingerprint,subject,subjectFingerprint,payloadFingerprint,evidenceFingerprint,authorityFingerprint,relationshipFingerprint,semanticHash:"0".repeat(64),eventHash:"0".repeat(64),evidenceRefs,authoritySnapshot,relationships,payload};
  event.semanticHash=deriveSemanticHash(event); event.eventId=deriveEventId(event.semanticHash); event.eventHash=deriveEventHash(event); return event;
}
test("valid event.v4 for every event type", () => {
  for (const type of Object.keys(EVENT_PAYLOAD_CONTRACTS)) {
    const result=validateOperationalMemoryEvent(makeEvent(type));
    assert.equal(result.ok,true,`${type}: ${result.errors.join(",")}`);
  }
});
test("reject frozen v1/v2/v3 schemas, closed-shape and bad identities", () => {
  const good=makeEvent("OBSERVATION"); assert.doesNotThrow(()=>assertOperationalMemoryEvent(good));
  for (const schema of [
    "ai-matchlab.operational-memory.event.v1",
    "ai-matchlab.operational-memory.event.v2",
    "ai-matchlab.operational-memory.event.v3"
  ]) {
    const frozen = structuredClone(good);
    frozen.schema = schema;
    resealEvent(frozen);
    assert.equal(validateOperationalMemoryEvent(frozen).ok,false,`schema ${schema} must be rejected`);
  }

  const missing=structuredClone(good); delete missing.payload; assert.equal(validateOperationalMemoryEvent(missing).ok,false);
  assert.equal(validateOperationalMemoryEvent({...good,extra:true}).ok,false);
  assert.equal(validateOperationalMemoryEvent({...good,payloadFingerprint:"f".repeat(64)}).ok,false);
  assert.equal(validateOperationalMemoryEvent({...good,semanticHash:"f".repeat(64)}).ok,false);
  assert.equal(validateOperationalMemoryEvent({...good,eventId:"om1_"+"f".repeat(64)}).ok,false);
  assert.equal(validateOperationalMemoryEvent({...good,eventHash:"f".repeat(64)}).ok,false);
});
test("secret rejection and no I2 graph traversal", () => {
  const bad=makeEvent("OBSERVATION"); bad.payload.summary="password=12345678"; bad.payloadFingerprint=derivePayloadFingerprint(bad.payload); bad.semanticHash=deriveSemanticHash(bad); bad.eventId=deriveEventId(bad.semanticHash); bad.eventHash=deriveEventHash(bad);
  assert.equal(validateOperationalMemoryEvent(bad).ok,false);
  assert.equal(validateOperationalMemoryEvent(makeEvent("DIAGNOSIS")).ok,true);
});

function resealEvent(event) {
  event.producerFingerprint=deriveProducerFingerprint(event.producer);
  event.subjectFingerprint=deriveSubjectFingerprint(event.subject);
  event.payloadFingerprint=derivePayloadFingerprint(event.payload);
  event.evidenceFingerprint=deriveEvidenceFingerprint(event.evidenceRefs);
  event.authorityFingerprint=deriveAuthorityFingerprint(event.authoritySnapshot);
  event.relationshipFingerprint=deriveRelationshipFingerprint(event.relationships);
  event.caseIdentity.subjectFingerprint=event.subjectFingerprint;
  event.caseIdentity.rootEvidenceFingerprint=event.evidenceFingerprint;
  event.caseId=deriveCaseId(event.caseIdentity);
  event.semanticHash=deriveSemanticHash(event);
  event.eventId=deriveEventId(event.semanticHash);
  event.eventHash=deriveEventHash(event);
  return event;
}
test("V14 subject evidence relationship and cardinality contracts fail closed", () => {
  const badDay=makeEvent("OBSERVATION");
  badDay.subject={scope:"DAY",key:"not-a-calendar-day"};
  resealEvent(badDay);
  assert.equal(validateOperationalMemoryEvent(badDay).ok,false);

  const badEvidence=makeEvent("OBSERVATION");
  badEvidence.evidenceRefs=[{evidenceRefId:"ev1_"+"a".repeat(64)}];
  resealEvent(badEvidence);
  assert.equal(validateOperationalMemoryEvent(badEvidence).ok,false);

  const badRelationship=makeEvent("OBSERVATION");
  badRelationship.relationships.causedByEventId="om1_"+"a".repeat(64);
  resealEvent(badRelationship);
  assert.equal(validateOperationalMemoryEvent(badRelationship).ok,false);

  const tooManyParents=makeEvent("OBSERVATION");
  tooManyParents.relationships.parentEventIds=Array.from({length:65},(_,i)=>"om1_"+i.toString(16).padStart(64,"0"));
  resealEvent(tooManyParents);
  assert.equal(validateOperationalMemoryEvent(tooManyParents).ok,false);

  const tooManyFacts=makeEvent("OBSERVATION");
  tooManyFacts.payload.facts=Array.from({length:129},(_,i)=>({key:`fact${i}`,valueType:"STRING",value:"v"}));
  resealEvent(tooManyFacts);
  assert.equal(validateOperationalMemoryEvent(tooManyFacts).ok,false);
});
