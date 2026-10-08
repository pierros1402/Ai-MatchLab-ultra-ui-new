import {
  AUTHORITY_SNAPSHOT_CONTRACT,
  CASE_IDENTITY_CONTRACT,
  EVIDENCE_CANONICALIZATION_CONTRACT,
  EVENT_ENVELOPE_FIELDS,
  EVENT_PAYLOAD_CONTRACTS,
  EVENT_TYPES,
  NESTED_PAYLOAD_SCHEMAS,
  NORMATIVE_REGEX_PATTERNS,
  OPERATIONAL_MEMORY_EVENT_SCHEMA,
  PRODUCER_IDENTITY_CONTRACT,
  RELATIONSHIP_CONTRACT,
  RESOURCE_BOUNDS,
  SECURITY_CONTRACT,
  SUBJECT_IDENTITY_CONTRACT
} from "./contract-v1.js";
import { canonicalUtf8Bytes } from "./canonical-json.js";
import { assertExactKeys, assertNfcString, matchPortablePattern, unicodeScalarLength } from "./primitive-validation.js";
import { assertOperationalMemoryTextSafe } from "./security-scanner-v1.js";
import {
  deriveAuthorityFingerprint, deriveCaseId, deriveEvidenceFingerprint, deriveEventHash,
  deriveEventId, derivePayloadFingerprint, deriveProducerFingerprint,
  deriveRelationshipFingerprint, deriveSemanticHash, deriveSubjectFingerprint
} from "./event-identity.js";

function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function fail(code) { throw new TypeError(code); }
function assertSha(value, label) {
  if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.SHA256_HEX)) fail(`${label}:SHA256_HEX_REQUIRED`);
}
function assertEventId(value, label) {
  if (typeof value !== "string" || !/^om1_[0-9a-f]{64}$/.test(value)) fail(`${label}:EVENT_ID_REQUIRED`);
}
function assertCanonicalUtc(value, label) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) fail(`${label}:CANONICAL_UTC_REQUIRED`);
}
function assertCanonicalRepositoryPath(value, label) {
  if (typeof value !== "string") fail(`${label}:REPOSITORY_PATH_REQUIRED`);
  assertNfcString(value, label);
  if (!value || value.trim() !== value) fail(`${label}:REPOSITORY_PATH_CANONICAL`);
  if (value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value)) fail(`${label}:REPOSITORY_PATH_CANONICAL`);
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) fail(`${label}:REPOSITORY_PATH_CANONICAL`);
  const maxBytes = RESOURCE_BOUNDS.maximumRepositoryPathBytesUtf8 ?? 1024;
  if (new TextEncoder().encode(value).length > maxBytes) fail(`${label}:REPOSITORY_PATH_TOO_LONG`);
}
function validatePrimitive(value, type, label) {
  if (type === "BOOLEAN" || type === "BOOLEAN_ONLY") { if (typeof value !== "boolean") fail(`${label}:BOOLEAN_REQUIRED`); return; }
  if (type === "FINITE_NUMBER" || type === "NUMBER") { if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label}:FINITE_NUMBER_REQUIRED`); return; }
  if (type === "SHA256_HEX" || type === "STATE_FINGERPRINT") { assertSha(value, label); return; }
  if (type === "GIT_SHA1") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.GIT_SHA1)) fail(`${label}:GIT_SHA1_REQUIRED`); return; }
  if (type === "STABLE_ID") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.STABLE_ID)) fail(`${label}:STABLE_ID_REQUIRED`); return; }
  if (type === "EVIDENCE_REF_ID") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.EVIDENCE_REF_ID)) fail(`${label}:EVIDENCE_REF_ID_REQUIRED`); return; }
  if (type === "CASE_ID") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.CASE_ID)) fail(`${label}:CASE_ID_REQUIRED`); return; }
  if (type === "CANONICAL_MATCH_ID") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.CANONICAL_MATCH_ID)) fail(`${label}:CANONICAL_MATCH_ID_REQUIRED`); return; }
  if (type === "CALENDAR_DAY") { if (typeof value !== "string" || !matchPortablePattern(value, NORMATIVE_REGEX_PATTERNS.CALENDAR_DAY)) fail(`${label}:CALENDAR_DAY_REQUIRED`); return; }
  if (type === "UTC_TIMESTAMP") { assertCanonicalUtc(value, label); return; }
  if (typeof value === "string") {
    assertNfcString(value, label);
    if (unicodeScalarLength(value) === 0) fail(`${label}:NONEMPTY_REQUIRED`);
  }
}
function validateNamedSchema(value, schemaName, label) {
  const spec = NESTED_PAYLOAD_SCHEMAS[schemaName];
  if (!spec) return;
  if (typeof spec.representation === "string" && spec.representation.startsWith("array<")) {
    if (!Array.isArray(value)) fail(`${label}:ARRAY_REQUIRED`);
    const itemSchema = spec.representation.slice(6, -1);
    for (let i = 0; i < value.length; i++) {
      if (NESTED_PAYLOAD_SCHEMAS[itemSchema]) validateNamedSchema(value[i], itemSchema, `${label}[${i}]`);
      else if (itemSchema === "STRING") assertNfcString(value[i], `${label}[${i}]`);
    }
    if (spec.uniqueBy) {
      const seen = new Set();
      for (const item of value) {
        const key = item?.[spec.uniqueBy];
        if (seen.has(key)) fail(`${label}:DUPLICATE_${spec.uniqueBy}`);
        seen.add(key);
      }
    }
    return;
  }
  if (!isObject(value)) fail(`${label}:OBJECT_REQUIRED`);
  if (spec.closed && Array.isArray(spec.required)) assertExactKeys(value, spec.required, spec.optional || [], label);
  for (const field of [...(spec.required || []), ...(spec.optional || [])]) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
    const schema = spec[`${field}Schema`], type = spec[`${field}Type`], enumValues = spec[`${field}Enum`];
    if (schema) validateNamedSchema(value[field], schema, `${label}.${field}`);
    if (type) validatePrimitive(value[field], type, `${label}.${field}`);
    if (enumValues && !enumValues.includes(value[field])) fail(`${label}.${field}:ENUM`);
  }
}
function validatePayload(payload, eventType) {
  const spec = EVENT_PAYLOAD_CONTRACTS[eventType];
  if (!spec) fail("UNKNOWN_EVENT_TYPE");
  if (!isObject(payload)) fail("payload:OBJECT_REQUIRED");
  assertExactKeys(payload, spec.required || [], spec.optional || [], "payload");
  if (Array.isArray(payload.facts) && payload.facts.length > RESOURCE_BOUNDS.maximumFacts) fail("payload.facts:CARDINALITY");
  for (const field of [...(spec.required || []), ...(spec.optional || [])]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
    const schema = spec[`${field}Schema`], type = spec[`${field}Type`], enumValues = spec[`${field}Enum`];
    if (schema) validateNamedSchema(payload[field], schema, `payload.${field}`);
    if (type) validatePrimitive(payload[field], type, `payload.${field}`);
    if (enumValues && !enumValues.includes(payload[field])) fail(`payload.${field}:ENUM`);
  }
}
function walkSecurity(value, label = "$") {
  if (typeof value === "string") { assertNfcString(value, label); assertOperationalMemoryTextSafe(value); return; }
  if (Array.isArray(value)) { value.forEach((child, i) => walkSecurity(child, `${label}[${i}]`)); return; }
  if (!isObject(value)) return;
  const secretNames = new Set(SECURITY_CONTRACT.sensitiveDataClassificationRules.forbiddenSecretFieldNames.map((x) => x.toLowerCase()));
  const sensitiveNames = new Set(SECURITY_CONTRACT.sensitiveDataClassificationRules.forbiddenSensitiveRecordFieldNames.map((x) => x.toLowerCase()));
  for (const [key, child] of Object.entries(value)) {
    const folded = key.normalize("NFC").toLowerCase();
    if (secretNames.has(folded)) fail(`FORBIDDEN_STRUCTURAL_SECRET_FIELD:${key}`);
    if (sensitiveNames.has(folded)) fail(`FORBIDDEN_STRUCTURAL_SENSITIVE_RECORD_FIELD:${key}`);
    walkSecurity(child, `${label}.${key}`);
  }
}
function validateProducer(producer) {
  assertExactKeys(producer, PRODUCER_IDENTITY_CONTRACT.requiredFields, [], "producer");
  if (!matchPortablePattern(producer.producerId, NORMATIVE_REGEX_PATTERNS.PRODUCER_ID)) fail("producer.producerId");
  if (!PRODUCER_IDENTITY_CONTRACT.producerRoleEnum.includes(producer.producerRole)) fail("producer.producerRole");
}
function validateSubject(subject) {
  assertExactKeys(subject, SUBJECT_IDENTITY_CONTRACT.requiredFields, SUBJECT_IDENTITY_CONTRACT.optionalFields || [], "subject");
  if (!SUBJECT_IDENTITY_CONTRACT.scopeEnum.includes(subject.scope)) fail("subject.scope");
  assertNfcString(subject.key, "subject.key");
  if (!subject.key || subject.key.trim() !== subject.key) fail("subject.key:CANONICAL");
  const keySpec = SUBJECT_IDENTITY_CONTRACT.keySchemaByScope?.[subject.scope];
  if (!isObject(keySpec) || typeof keySpec.type !== "string") fail("subject.key:SCHEMA_MISSING");
  if (keySpec.type === "LITERAL") {
    if (subject.key !== keySpec.value) fail("subject.key:LITERAL");
    return;
  }
  if (keySpec.type === "CANONICAL_REPOSITORY_PATH") {
    assertCanonicalRepositoryPath(subject.key, "subject.key");
    return;
  }
  validatePrimitive(subject.key, keySpec.type, "subject.key");
}
function validateAuthority(authority) {
  assertExactKeys(authority, AUTHORITY_SNAPSHOT_CONTRACT.requiredFields, [], "authoritySnapshot");
  for (const key of AUTHORITY_SNAPSHOT_CONTRACT.requiredFields) if (typeof authority[key] !== "boolean") fail(`authoritySnapshot.${key}:BOOLEAN_REQUIRED`);
}
function validateRelationships(relationships, eventType) {
  assertExactKeys(relationships, RELATIONSHIP_CONTRACT.fields, [], "relationships");
  if (!Array.isArray(relationships.parentEventIds)) fail("relationships.parentEventIds:ARRAY_REQUIRED");
  if (relationships.parentEventIds.length > RESOURCE_BOUNDS.maximumParentEventIds) fail("relationships.parentEventIds:CARDINALITY");
  const sorted = [...relationships.parentEventIds].sort();
  if (new Set(sorted).size !== sorted.length) fail("relationships.parentEventIds:DUPLICATE");
  for (let i = 0; i < sorted.length; i++) {
    assertEventId(sorted[i], `relationships.parentEventIds[${i}]`);
    if (sorted[i] !== relationships.parentEventIds[i]) fail("relationships.parentEventIds:NOT_SORTED");
  }
  for (const field of RELATIONSHIP_CONTRACT.fields) {
    if (field === "parentEventIds") continue;
    const value = relationships[field];
    if (value !== null) assertEventId(value, `relationships.${field}`);
  }
  const shape = RELATIONSHIP_CONTRACT.perEventShape?.[eventType];
  if (!isObject(shape)) fail("relationships:EVENT_SHAPE_MISSING");
  const allowed = new Set(shape.allowedNonNull || []);
  for (const field of RELATIONSHIP_CONTRACT.scalarRelationshipFields || []) {
    if (relationships[field] !== null && !allowed.has(field)) fail(`relationships.${field}:NOT_ALLOWED_FOR_${eventType}`);
  }
  for (const field of shape.requiredNonNull || []) {
    if (field === "parentEventIds") {
      if (relationships.parentEventIds.length === 0) fail("relationships.parentEventIds:REQUIRED_NONEMPTY");
    } else if (relationships[field] === null) {
      fail(`relationships.${field}:REQUIRED_FOR_${eventType}`);
    }
  }
}
function validateEvidenceRefs(refs) {
  if (!Array.isArray(refs)) fail("evidenceRefs:ARRAY_REQUIRED");
  if (refs.length > RESOURCE_BOUNDS.maximumEvidenceRefs) fail("evidenceRefs:CARDINALITY");
  const ids = [];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const label = `evidenceRefs[${i}]`;
    if (!isObject(ref)) fail(`${label}:OBJECT_REQUIRED`);
    assertExactKeys(ref, EVIDENCE_CANONICALIZATION_CONTRACT.requiredFields, EVIDENCE_CANONICALIZATION_CONTRACT.optionalFields || [], label);
    if (typeof ref.evidenceRefId !== "string" || !matchPortablePattern(ref.evidenceRefId, NORMATIVE_REGEX_PATTERNS.EVIDENCE_REF_ID)) fail(`${label}.evidenceRefId`);
    if (!EVIDENCE_CANONICALIZATION_CONTRACT.kindEnum.includes(ref.kind)) fail(`${label}.kind`);
    if (!EVIDENCE_CANONICALIZATION_CONTRACT.locatorTypeEnum.includes(ref.locatorType)) fail(`${label}.locatorType`);
    assertNfcString(ref.locator, `${label}.locator`);
    if (!ref.locator || ref.locator.trim() !== ref.locator) fail(`${label}.locator:CANONICAL`);
    assertSha(ref.sha256, `${label}.sha256`);
    if (ref.locatorType === "REPOSITORY_PATH") {
      assertCanonicalRepositoryPath(ref.locator, `${label}.locator`);
      if (!Object.prototype.hasOwnProperty.call(ref, "gitCommit")) fail(`${label}.gitCommit:REQUIRED_FOR_REPOSITORY_PATH`);
    }
    if (Object.prototype.hasOwnProperty.call(ref, "schema")) {
      assertNfcString(ref.schema, `${label}.schema`);
      if (!ref.schema || ref.schema.trim() !== ref.schema) fail(`${label}.schema:CANONICAL`);
    }
    if (Object.prototype.hasOwnProperty.call(ref, "gitCommit")) validatePrimitive(ref.gitCommit, "GIT_SHA1", `${label}.gitCommit`);
    if (Object.prototype.hasOwnProperty.call(ref, "generatedAt")) assertCanonicalUtc(ref.generatedAt, `${label}.generatedAt`);
    ids.push(ref.evidenceRefId);
  }
  const sorted = [...ids].sort();
  if (new Set(sorted).size !== sorted.length) fail("evidenceRefs:DUPLICATE_ID");
  for (let i = 0; i < sorted.length; i++) if (sorted[i] !== ids[i]) fail("evidenceRefs:NOT_SORTED");
}
function validateCaseIdentity(caseIdentity) {
  const required = ["schema", ...CASE_IDENTITY_CONTRACT.requiredFields];
  assertExactKeys(caseIdentity, required, [], "caseIdentity");
  if (caseIdentity.schema !== CASE_IDENTITY_CONTRACT.schema) fail("caseIdentity.schema");
  assertSha(caseIdentity.subjectFingerprint, "caseIdentity.subjectFingerprint");
  assertSha(caseIdentity.rootEvidenceFingerprint, "caseIdentity.rootEvidenceFingerprint");
  assertCanonicalUtc(caseIdentity.rootEffectiveAt, "caseIdentity.rootEffectiveAt");
  validatePrimitive(caseIdentity.caseType, "STABLE_ID", "caseIdentity.caseType");
  validatePrimitive(caseIdentity.triggerClass, "STABLE_ID", "caseIdentity.triggerClass");
}
function validateEnvelope(event) {
  assertExactKeys(event, EVENT_ENVELOPE_FIELDS, [], "event");
  if (event.schema !== OPERATIONAL_MEMORY_EVENT_SCHEMA) fail("event.schema");
  if (!EVENT_TYPES.includes(event.eventType)) fail("event.eventType");
  assertEventId(event.eventId, "event.eventId");
  if (typeof event.caseId !== "string" || !matchPortablePattern(event.caseId, NORMATIVE_REGEX_PATTERNS.CASE_ID)) fail("event.caseId");
  assertCanonicalUtc(event.effectiveAt, "event.effectiveAt");
  assertCanonicalUtc(event.recordedAt, "event.recordedAt");
  if (event.effectiveUtcDay !== event.effectiveAt.slice(0, 10)) fail("event.effectiveUtcDay");
  for (const field of ["producerFingerprint","subjectFingerprint","payloadFingerprint","evidenceFingerprint","authorityFingerprint","relationshipFingerprint","semanticHash","eventHash"]) assertSha(event[field], `event.${field}`);
  validateProducer(event.producer);
  validateSubject(event.subject);
  validateCaseIdentity(event.caseIdentity);
  validateEvidenceRefs(event.evidenceRefs);
  validateAuthority(event.authoritySnapshot);
  validateRelationships(event.relationships, event.eventType);
  validatePayload(event.payload, event.eventType);
}
export function assertOperationalMemoryEvent(event) {
  if (!isObject(event)) fail("EVENT_OBJECT_REQUIRED");
  walkSecurity(event);
  validateEnvelope(event);

  const producerFingerprint = deriveProducerFingerprint(event.producer);
  const subjectFingerprint = deriveSubjectFingerprint(event.subject);
  const payloadFingerprint = derivePayloadFingerprint(event.payload);
  const evidenceFingerprint = deriveEvidenceFingerprint(event.evidenceRefs);
  const authorityFingerprint = deriveAuthorityFingerprint(event.authoritySnapshot);
  const relationshipFingerprint = deriveRelationshipFingerprint(event.relationships);

  if (event.producerFingerprint !== producerFingerprint) fail("producerFingerprint:MISMATCH");
  if (event.subjectFingerprint !== subjectFingerprint) fail("subjectFingerprint:MISMATCH");
  if (event.payloadFingerprint !== payloadFingerprint) fail("payloadFingerprint:MISMATCH");
  if (event.evidenceFingerprint !== evidenceFingerprint) fail("evidenceFingerprint:MISMATCH");
  if (event.authorityFingerprint !== authorityFingerprint) fail("authorityFingerprint:MISMATCH");
  if (event.relationshipFingerprint !== relationshipFingerprint) fail("relationshipFingerprint:MISMATCH");
  if (event.caseIdentity.subjectFingerprint !== subjectFingerprint) fail("caseIdentity.subjectFingerprint:MISMATCH");
  if (event.eventType === "OBSERVATION" && event.caseIdentity.rootEvidenceFingerprint !== evidenceFingerprint) fail("caseIdentity.rootEvidenceFingerprint:MISMATCH");

  const caseId = deriveCaseId(event.caseIdentity);
  if (event.caseId !== caseId) fail("caseId:MISMATCH");
  const semanticHash = deriveSemanticHash(event);
  if (event.semanticHash !== semanticHash) fail("semanticHash:MISMATCH");
  const eventId = deriveEventId(semanticHash);
  if (event.eventId !== eventId) fail("eventId:MISMATCH");
  const eventHash = deriveEventHash(event);
  if (event.eventHash !== eventHash) fail("eventHash:MISMATCH");

  const maxBytes = RESOURCE_BOUNDS.maximumCanonicalEventBytes ?? RESOURCE_BOUNDS.maxCanonicalEventBytes ?? 262144;
  if (canonicalUtf8Bytes(event).length > maxBytes) fail("CANONICAL_EVENT_BYTES_EXCEEDED");
  return event;
}
export function validateOperationalMemoryEvent(event) {
  try { assertOperationalMemoryEvent(event); return Object.freeze({ ok: true, errors: [] }); }
  catch (error) { return Object.freeze({ ok: false, errors: [String(error?.message || error)] }); }
}
