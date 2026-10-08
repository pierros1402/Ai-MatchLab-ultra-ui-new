import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_ARCHITECTURE_CONTRACT_SHA256, EVENT_TYPES, NORMATIVE_REGEX_PATTERNS, OPERATIONAL_MEMORY_CONTRACT, OPERATIONAL_MEMORY_EVENT_SCHEMA, PAYLOAD_FINGERPRINT_FORMULA } from "../core/operational-memory/contract-v1.js";
test("approved V13 runtime contract is frozen and event.v3-only", () => {
  assert.equal(APPROVED_ARCHITECTURE_CONTRACT_SHA256, "84067F618A5AFB4701B79511212066EC2DC0389EBE000A2B2902CBE1C67F0214");
  assert.equal(OPERATIONAL_MEMORY_EVENT_SCHEMA, "ai-matchlab.operational-memory.event.v3");
  assert.equal(PAYLOAD_FINGERPRINT_FORMULA, "sha256(canonicalJson(payload))");
  assert.equal(Object.isFrozen(OPERATIONAL_MEMORY_CONTRACT), true);
  assert.equal(Object.isFrozen(NORMATIVE_REGEX_PATTERNS), true);
  assert.deepEqual([...EVENT_TYPES].sort(), ["AUTHORIZATION_RECORD","DIAGNOSIS","EXECUTION_ATTEMPT","OBSERVATION","OUTCOME_VERIFICATION","REPAIR_PLAN","ROLLBACK_RECOVERY","VALIDITY_CHANGE"].sort());
  assert.equal(NORMATIVE_REGEX_PATTERNS.SHA256_HEX, "^[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.GIT_SHA1, "^[0-9abcdef]{40}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.EVIDENCE_REF_ID, "^ev1_[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.CASE_ID, "^case2_[0-9abcdef]{64}$");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.currentEventSchema, "ai-matchlab.operational-memory.event.v3");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.eventV2Disposition.writerSupported, false);
});
