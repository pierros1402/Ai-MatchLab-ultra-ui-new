import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  evaluateAutonomousRepairExecutionRequestGate
} from "./autonomous-repair-execution-request-gate.js";
import {
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE,
  validateAutonomousRepairExecutionAuthorizationArtifact,
  verifyAutonomousRepairExecutionAuthorizationBinding
} from "./autonomous-repair-execution-authorization.js";

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

function verifiedTargetArtifact() {
  const evidenceCore = {
    operationId: "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa",
    targetPath: "data/history/request.json",
    mutationMode: "CREATE",
    lexicalContained: true,
    physicalContained: true,
    reparseFree: true,
    parentChainVerified: true,
    targetExists: false,
    actualSha256: null,
    actualBytes: null,
    preconditionMatches: true
  };

  const operation = {
    ...evidenceCore,
    preimageFingerprint: sha256Value(evidenceCore),
    verified: true
  };

  const summary = {
    operationCount: 1,
    verifiedOperationCount: 1,
    blockedOperationCount: 0,
    createCount: 1,
    replaceCount: 0,
    blockerCount: 0
  };

  const authority = {
    readOnly: true,
    filesystemWriteAuthorized: false,
    repairAuthorized: false,
    executionAuthorized: false,
    rollbackExecutionAuthorized: false,
    workflowMutationAuthorized: false
  };

  const artifact = {
    schema: "ai-matchlab.autonomous-repair-target-verification.v1",
    version: "1.0.0",
    dayKey: "2026-09-16",
    generatedAt: "2026-09-16T08:00:00.000Z",
    role: "derived_read_only_target_preimage_verification",
    planFingerprint: "1".repeat(64),
    verificationFingerprint: null,
    verificationState: "TARGETS_VERIFIED",
    summary,
    operations: [operation],
    blockers: [],
    authority
  };

  artifact.verificationFingerprint = sha256Value({
    schema: artifact.schema,
    version: artifact.version,
    dayKey: artifact.dayKey,
    planFingerprint: artifact.planFingerprint,
    verificationState: artifact.verificationState,
    summary: artifact.summary,
    operations: artifact.operations,
    blockers: artifact.blockers,
    authority: artifact.authority
  });

  return artifact;
}

function requestArtifact() {
  return evaluateAutonomousRepairExecutionRequestGate({
    targetVerification: verifiedTargetArtifact(),
    generatedAt: "2026-09-16T09:00:00.000Z"
  });
}

function authorizationArtifact({
  request = requestArtifact(),
  state = AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED
} = {}) {
  const granted =
    state === AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.AUTHORIZED;

  const artifact = {
    schema: AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_SCHEMA,
    version: "1.0.0",
    dayKey: request.dayKey,
    generatedAt: "2026-09-16T10:00:00.000Z",
    role: "externally_issued_bounded_execution_authorization",
    requestFingerprint: request.requestFingerprint,
    planFingerprint: request.planFingerprint,
    verificationFingerprint: request.verificationFingerprint,
    authorizationFingerprint: null,
    authorizationState: state,
    authorizationBasis: {
      source: "external_control_plane",
      issuerId: "test-control-plane",
      decisionFingerprint: "2".repeat(64)
    },
    operationScope: request.operationScope.map(
      row => ({
        operationId: row.operationId,
        targetPath: row.targetPath,
        mutationMode: row.mutationMode,
        preimageFingerprint: row.preimageFingerprint
      })
    ),
    safety: {
      exactRequestScopeOnly: true,
      preimageReverificationRequired: true,
      atomicWriteRequired: true,
      postWriteAuditRequired: true,
      rollbackRequired: true,
      singleUseEnforcementRequiredByExecutor: true
    },
    authority: {
      artifactReadOnly: true,
      authorizationGranted: granted,
      filesystemWriteAuthorized: granted,
      repairAuthorized: granted,
      executionAuthorized: granted,
      rollbackExecutionAuthorized: granted,
      workflowMutationAuthorized: false
    }
  };

  artifact.authorizationFingerprint = sha256Value({
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
  });

  return artifact;
}

function recomputeAuthorizationFingerprint(authorization) {
  authorization.authorizationFingerprint = sha256Value({
    schema: authorization.schema,
    version: authorization.version,
    dayKey: authorization.dayKey,
    role: authorization.role,
    requestFingerprint: authorization.requestFingerprint,
    planFingerprint: authorization.planFingerprint,
    verificationFingerprint: authorization.verificationFingerprint,
    authorizationState: authorization.authorizationState,
    authorizationBasis: authorization.authorizationBasis,
    operationScope: authorization.operationScope,
    safety: authorization.safety,
    authority: authorization.authority
  });
}

test("authorized artifact validates with exact bounded safety contract", () => {
  assert.equal(
    validateAutonomousRepairExecutionAuthorizationArtifact(
      authorizationArtifact()
    ),
    true
  );
});

test("denied artifact validates but grants no execution authority", () => {
  const artifact = authorizationArtifact({
    state: AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.DENIED
  });

  assert.equal(
    validateAutonomousRepairExecutionAuthorizationArtifact(artifact),
    true
  );
  assert.equal(artifact.authority.authorizationGranted, false);
  assert.equal(artifact.authority.executionAuthorized, false);
});

test("authorized artifact binds exact request plan verification and operation scope", () => {
  const request = requestArtifact();
  const authorization = authorizationArtifact({ request });

  assert.equal(
    verifyAutonomousRepairExecutionAuthorizationBinding({
      executionRequest: request,
      authorization
    }),
    true
  );
});

test("request fingerprint drift fails closed", () => {
  const request = requestArtifact();
  const authorization = authorizationArtifact({ request });
  authorization.requestFingerprint = "3".repeat(64);
  recomputeAuthorizationFingerprint(authorization);

  assert.throws(
    () =>
      verifyAutonomousRepairExecutionAuthorizationBinding({
        executionRequest: request,
        authorization
      }),
    /binding_mismatch/
  );
});

test("preimage fingerprint scope drift fails closed", () => {
  const request = requestArtifact();
  const authorization = authorizationArtifact({ request });
  authorization.operationScope[0].preimageFingerprint = "4".repeat(64);
  recomputeAuthorizationFingerprint(authorization);

  assert.throws(
    () =>
      verifyAutonomousRepairExecutionAuthorizationBinding({
        executionRequest: request,
        authorization
      }),
    /scope_mismatch/
  );
});

test("denied authorization cannot be used for execution binding", () => {
  const request = requestArtifact();
  const authorization = authorizationArtifact({
    request,
    state: AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_STATE.DENIED
  });

  assert.throws(
    () =>
      verifyAutonomousRepairExecutionAuthorizationBinding({
        executionRequest: request,
        authorization
      }),
    /not_granted/
  );
});

test("false safety contract is rejected even with recomputed fingerprint", () => {
  const authorization = authorizationArtifact();
  authorization.safety.preimageReverificationRequired = false;
  recomputeAuthorizationFingerprint(authorization);

  assert.throws(
    () => validateAutonomousRepairExecutionAuthorizationArtifact(authorization),
    /safety_invalid/
  );
});

test("workflow mutation authority is always forbidden", () => {
  const authorization = authorizationArtifact();
  authorization.authority.workflowMutationAuthorized = true;
  recomputeAuthorizationFingerprint(authorization);

  assert.throws(
    () => validateAutonomousRepairExecutionAuthorizationArtifact(authorization),
    /authority_invalid/
  );
});

test("authorization fingerprint excludes generatedAt-only churn", () => {
  const first = authorizationArtifact();
  const second = authorizationArtifact();
  second.generatedAt = "2026-09-16T11:00:00.000Z";

  assert.equal(
    first.authorizationFingerprint,
    second.authorizationFingerprint
  );
});

test("authorization core has no filesystem mutation surface", () => {
  const source = fs.readFileSync(
    new URL("./autonomous-repair-execution-authorization.js", import.meta.url),
    "utf8"
  );

  assert.equal(source.includes('from "node:fs"'), false);

  for (
    const forbidden of [
      "writeFileSync(",
      "writeFile(",
      "appendFileSync(",
      "appendFile(",
      "renameSync(",
      "rename(",
      "unlinkSync(",
      "unlink(",
      "rmSync(",
      "rm(",
      "mkdirSync(",
      "mkdir(",
      "copyFileSync(",
      "copyFile(",
      "createWriteStream(",
      "fsyncSync("
    ]
  ) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
