import { createHash } from "node:crypto";
import {
  AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE,
  validateAutonomousRepairExecutionRequestGateArtifact
} from "./autonomous-repair-execution-request-gate.js";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-authorization.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE =
  Object.freeze({
    AUTHORIZED: "AUTHORIZED",
    DENIED: "DENIED"
  });

const VALID_SHA = /^[0-9a-f]{64}$/u;
const VALID_DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const VALID_OPERATION_ID = /^arpo_v1_[0-9a-f]{24}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, stableValue(value[key])])
    );
  }
  return value;
}

function sha256Value(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

function compareScope(a, b) {
  return [a.targetPath, a.operationId]
    .join("\u0000")
    .localeCompare([b.targetPath, b.operationId].join("\u0000"));
}

function fingerprintInput(artifact) {
  return {
    schema: artifact.schema,
    version: artifact.version,
    dayKey: artifact.dayKey,
    role: artifact.role,
    requestFingerprint: artifact.requestFingerprint,
    planFingerprint: artifact.planFingerprint,
    verificationFingerprint: artifact.verificationFingerprint,
    authorizationState: artifact.authorizationState,
    authorizationBasis: artifact.authorizationBasis,
    operationScope: artifact.operationScope,
    safety: artifact.safety,
    authority: artifact.authority
  };
}

function expectedAuthority(state) {
  const granted =
    state === AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED;

  return {
    artifactReadOnly: true,
    authorizationGranted: granted,
    filesystemWriteAuthorized: granted,
    repairAuthorized: granted,
    executionAuthorized: granted,
    rollbackExecutionAuthorized: granted,
    workflowMutationAuthorized: false
  };
}

export function validateAutonomousRepairExecutionAuthorizationArtifact(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !== "object" ||
    Array.isArray(artifact) ||
    artifact.schema !== AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_SCHEMA ||
    artifact.version !== AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_VERSION ||
    !VALID_DAY.test(clean(artifact.dayKey)) ||
    !clean(artifact.generatedAt) ||
    artifact.role !== "externally_issued_bounded_execution_authorization" ||
    !VALID_SHA.test(clean(artifact.requestFingerprint)) ||
    !VALID_SHA.test(clean(artifact.planFingerprint)) ||
    !VALID_SHA.test(clean(artifact.verificationFingerprint)) ||
    !VALID_SHA.test(clean(artifact.authorizationFingerprint)) ||
    ![
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED,
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.DENIED
    ].includes(artifact.authorizationState) ||
    !Array.isArray(artifact.operationScope) ||
    !exactKeys(
      artifact,
      [
        "schema",
        "version",
        "dayKey",
        "generatedAt",
        "role",
        "requestFingerprint",
        "planFingerprint",
        "verificationFingerprint",
        "authorizationFingerprint",
        "authorizationState",
        "authorizationBasis",
        "operationScope",
        "safety",
        "authority"
      ]
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_artifact_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.authorizationBasis,
      ["source", "issuerId", "decisionFingerprint"]
    ) ||
    artifact.authorizationBasis.source !== "external_control_plane" ||
    !clean(artifact.authorizationBasis.issuerId) ||
    !VALID_SHA.test(clean(artifact.authorizationBasis.decisionFingerprint))
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_basis_invalid"
    );
  }

  const operationIds = new Set();
  const targetPaths = new Set();

  for (let index = 0; index < artifact.operationScope.length; index += 1) {
    const row = artifact.operationScope[index];

    if (
      !exactKeys(
        row,
        ["operationId", "targetPath", "mutationMode", "preimageFingerprint"]
      ) ||
      !VALID_OPERATION_ID.test(clean(row.operationId)) ||
      !clean(row.targetPath) ||
      !["CREATE", "REPLACE"].includes(row.mutationMode) ||
      !VALID_SHA.test(clean(row.preimageFingerprint)) ||
      operationIds.has(row.operationId) ||
      targetPaths.has(row.targetPath)
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_scope_invalid"
      );
    }

    operationIds.add(row.operationId);
    targetPaths.add(row.targetPath);

    if (
      index > 0 &&
      compareScope(artifact.operationScope[index - 1], row) > 0
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_scope_order_invalid"
      );
    }
  }

  if (
    artifact.authorizationState ===
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED &&
    artifact.operationScope.length === 0
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_empty_scope_forbidden"
    );
  }

  if (
    !exactKeys(
      artifact.safety,
      [
        "exactRequestScopeOnly",
        "preimageReverificationRequired",
        "atomicWriteRequired",
        "postWriteAuditRequired",
        "rollbackRequired",
        "singleUseEnforcementRequiredByExecutor"
      ]
    ) ||
    artifact.safety.exactRequestScopeOnly !== true ||
    artifact.safety.preimageReverificationRequired !== true ||
    artifact.safety.atomicWriteRequired !== true ||
    artifact.safety.postWriteAuditRequired !== true ||
    artifact.safety.rollbackRequired !== true ||
    artifact.safety.singleUseEnforcementRequiredByExecutor !== true
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_safety_invalid"
    );
  }

  const authority = expectedAuthority(artifact.authorizationState);

  if (
    !exactKeys(
      artifact.authority,
      [
        "artifactReadOnly",
        "authorizationGranted",
        "filesystemWriteAuthorized",
        "repairAuthorized",
        "executionAuthorized",
        "rollbackExecutionAuthorized",
        "workflowMutationAuthorized"
      ]
    ) ||
    sha256Value(artifact.authority) !== sha256Value(authority)
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_authority_invalid"
    );
  }

  if (
    sha256Value(fingerprintInput(artifact)) !== artifact.authorizationFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_fingerprint_mismatch"
    );
  }

  return true;
}

export function verifyAutonomousRepairExecutionAuthorizationBinding({
  executionRequest,
  authorization
} = {}) {
  if (
    validateAutonomousRepairExecutionRequestGateArtifact(
      executionRequest
    ) !== true
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_request_invalid"
    );
  }

  if (
    validateAutonomousRepairExecutionAuthorizationArtifact(
      authorization
    ) !== true
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_invalid"
    );
  }

  if (
    executionRequest.requestState !==
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE ||
    executionRequest.authority.authorizationRequestEligible !== true ||
    executionRequest.blockers.length !== 0 ||
    executionRequest.operationScope.length === 0 ||
    executionRequest.operationScope.some(row => row.verified !== true)
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_request_not_eligible"
    );
  }

  if (
    authorization.authorizationState !==
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_not_granted"
    );
  }

  if (
    authorization.dayKey !== executionRequest.dayKey ||
    authorization.requestFingerprint !== executionRequest.requestFingerprint ||
    authorization.planFingerprint !== executionRequest.planFingerprint ||
    authorization.verificationFingerprint !==
      executionRequest.verificationFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_binding_mismatch"
    );
  }

  const requestScope =
    executionRequest.operationScope.map(
      row => ({
        operationId: row.operationId,
        targetPath: row.targetPath,
        mutationMode: row.mutationMode,
        preimageFingerprint: row.preimageFingerprint
      })
    );

  if (
    sha256Value(requestScope) !== sha256Value(authorization.operationScope)
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_scope_mismatch"
    );
  }

  return true;
}
