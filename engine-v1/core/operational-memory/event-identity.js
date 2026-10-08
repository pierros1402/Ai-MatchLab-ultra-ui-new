import { IDENTITY_CONTRACT } from "./contract-v1.js";
import { sha256Canonical } from "./canonical-json.js";

function sortedEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) throw new TypeError("EVIDENCE_REFS_ARRAY_REQUIRED");
  const refs = evidenceRefs.map((value) => ({ ...value }));
  refs.sort((a, b) => String(a.evidenceRefId) < String(b.evidenceRefId) ? -1 : String(a.evidenceRefId) > String(b.evidenceRefId) ? 1 : 0);
  for (let i = 1; i < refs.length; i++) if (refs[i - 1].evidenceRefId === refs[i].evidenceRefId) throw new TypeError("DUPLICATE_EVIDENCE_REF_ID");
  return refs;
}

export function deriveCaseId(caseIdentity) {
  return `case2_${sha256Canonical({
    schema: caseIdentity.schema,
    caseType: caseIdentity.caseType,
    subjectFingerprint: caseIdentity.subjectFingerprint,
    triggerClass: caseIdentity.triggerClass,
    rootEffectiveAt: caseIdentity.rootEffectiveAt,
    rootEvidenceFingerprint: caseIdentity.rootEvidenceFingerprint
  })}`;
}
export const deriveProducerFingerprint = (producer) => sha256Canonical(producer);
export const deriveSubjectFingerprint = (subject) => sha256Canonical(subject);
export const derivePayloadFingerprint = (payload) => sha256Canonical(payload);
export const deriveEvidenceFingerprint = (refs) => sha256Canonical(sortedEvidenceRefs(refs));
export const deriveAuthorityFingerprint = (snapshot) => sha256Canonical(snapshot);
export const deriveRelationshipFingerprint = (relationships) => sha256Canonical(relationships);

export function deriveSemanticHash(event) {
  const projection = Object.create(null);
  for (const field of IDENTITY_CONTRACT.semanticIdentityProjectionFields) {
    if (!Object.prototype.hasOwnProperty.call(event, field)) throw new TypeError(`SEMANTIC_PROJECTION_FIELD_MISSING:${field}`);
    projection[field] = event[field];
  }
  return sha256Canonical(projection);
}

export function deriveEventId(eventOrSemanticHash) {
  const h = typeof eventOrSemanticHash === "string" ? eventOrSemanticHash : deriveSemanticHash(eventOrSemanticHash);
  if (!/^[0-9a-f]{64}$/.test(h)) throw new TypeError("SEMANTIC_HASH_INVALID");
  return `om1_${h}`;
}

export function deriveEventHash(event) {
  const persisted = Object.create(null);
  for (const key of Object.keys(event)) if (key !== "eventHash") persisted[key] = event[key];
  return sha256Canonical(persisted);
}
