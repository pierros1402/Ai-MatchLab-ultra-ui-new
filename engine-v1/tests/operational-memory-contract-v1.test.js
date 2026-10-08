import test from "node:test";
import assert from "node:assert/strict";
import { APPROVED_ARCHITECTURE_APPROVAL_SHA256, APPROVED_ARCHITECTURE_CONTRACT_SHA256, EVENT_TYPES, NORMATIVE_REGEX_PATTERNS, OPERATIONAL_MEMORY_CONTRACT, OPERATIONAL_MEMORY_EVENT_SCHEMA, PAYLOAD_FINGERPRINT_FORMULA } from "../core/operational-memory/contract-v1.js";

test("approved V14 runtime contract is frozen and event.v4-only", () => {
  assert.equal(APPROVED_ARCHITECTURE_CONTRACT_SHA256, "CC08A192AF29D07EA3F5B0F1F33F8CECCEA85C2E21707B83FA85EDC1668A0786");
  assert.equal(APPROVED_ARCHITECTURE_APPROVAL_SHA256, "ED4F284F1CC48252464A286E064048888056A918EFCBB9B4FFBE2734E1300574");
  assert.equal(OPERATIONAL_MEMORY_EVENT_SCHEMA, "ai-matchlab.operational-memory.event.v4");
  assert.equal(PAYLOAD_FINGERPRINT_FORMULA, "sha256(canonicalJson(payload))");
  assert.equal(Object.isFrozen(OPERATIONAL_MEMORY_CONTRACT), true);
  assert.equal(Object.isFrozen(NORMATIVE_REGEX_PATTERNS), true);
  assert.deepEqual([...EVENT_TYPES].sort(), ["AUTHORIZATION_RECORD","DIAGNOSIS","EXECUTION_ATTEMPT","OBSERVATION","OUTCOME_VERIFICATION","REPAIR_PLAN","ROLLBACK_RECOVERY","VALIDITY_CHANGE"].sort());
  assert.equal(NORMATIVE_REGEX_PATTERNS.SHA256_HEX, "^[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.GIT_SHA1, "^[0-9abcdef]{40}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.EVIDENCE_REF_ID, "^ev1_[0-9abcdef]{64}$");
  assert.equal(NORMATIVE_REGEX_PATTERNS.CASE_ID, "^case2_[0-9abcdef]{64}$");

  assert.equal(OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.currentEventSchema, "ai-matchlab.operational-memory.event.v4");
  assert.deepEqual(OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.supportedEventSchemas, ["ai-matchlab.operational-memory.event.v4"]);

  const v3 = OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.eventV3Disposition;
  assert.equal(v3.eventSchema, "ai-matchlab.operational-memory.event.v3");
  assert.equal(v3.immutable, true);
  assert.equal(v3.completedI1Implementation, true);
  assert.equal(v3.writerSupportedAfterV14Approval, false);
  assert.equal(v3.readerOperationallySupportedAfterV14Approval, false);
  assert.equal(v3.G7EligibleAfterV14Approval, false);
  assert.equal(v3.inPlaceSemanticRepairAllowed, false);

  assert.equal(OPERATIONAL_MEMORY_CONTRACT.validityControl.schema, "ai-matchlab.operational-memory.validity-control.v3");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.validityControl.successionProtocol, "PARENT_EVENT_IDS_ORDER_INDEPENDENT_DAG");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.validityControl.orderingModel, "ORDER_INDEPENDENT_IMMUTABLE_DAG");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.validityControl.multipleHeadsState, "CONFLICTED");
  assert.equal(OPERATIONAL_MEMORY_CONTRACT.validityControl.arbitraryWinnerAllowed, false);

  assert.equal(OPERATIONAL_MEMORY_CONTRACT.schemaEvolution.eventV2Disposition.writerSupported, false);
});