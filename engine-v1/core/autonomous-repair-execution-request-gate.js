import {
  createHash
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE,
  validateAutonomousRepairTargetVerificationArtifact
} from "./autonomous-repair-target-verifier.js";

export const AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-request-gate.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE =
  Object.freeze({
    NO_ACTION:
      "NO_ACTION_NO_OPERATIONS",
    REQUEST_ELIGIBLE:
      "EXECUTION_REQUEST_ELIGIBLE",
    BLOCKED:
      "BLOCKED_TARGET_VERIFICATION"
  });

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_OPERATION_ID =
  /^arpo_v1_[0-9a-f]{24}$/u;

const VALID_DAY =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function exactKeys(
  value,
  expected
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const actual =
    Object.keys(value)
      .sort();

  const wanted =
    [...expected]
      .sort();

  return (
    actual.length ===
      wanted.length &&
    actual.every(
      (key, index) =>
        key ===
        wanted[index]
    )
  );
}

function compareScope(a, b) {
  return [
    a.targetPath,
    a.operationId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.targetPath,
        b.operationId
      ].join("\u0000")
    );
}

function compareBlockers(a, b) {
  return [
    a.code,
    a.operationId ?? "",
    a.targetPath ?? ""
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.code,
        b.operationId ?? "",
        b.targetPath ?? ""
      ].join("\u0000")
    );
}

function zeroExecutionAuthority(
  authorizationRequestEligible
) {
  return {
    readOnly:
      true,

    authorizationRequestEligible:
      Boolean(
        authorizationRequestEligible
      ),

    authorizationGranted:
      false,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    rollbackExecutionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };
}

function projectOperationScope(
  operations
) {
  return operations
    .map(
      row => ({
        operationId:
          row.operationId,

        targetPath:
          row.targetPath,

        mutationMode:
          row.mutationMode,

        preimageFingerprint:
          row.preimageFingerprint,

        verified:
          row.verified
      })
    )
    .sort(
      compareScope
    );
}

function projectedBlockers(
  blockers
) {
  return blockers
    .map(
      row => ({
        code:
          row.code,

        operationId:
          row.operationId,

        targetPath:
          row.targetPath
      })
    )
    .sort(
      compareBlockers
    );
}

function stateFromVerification(
  targetVerification
) {
  if (
    targetVerification.verificationState ===
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION
  ) {
    return AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.NO_ACTION;
  }

  if (
    targetVerification.verificationState ===
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED
  ) {
    return AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE;
  }

  return AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.BLOCKED;
}

function fingerprintInput(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    dayKey:
      artifact.dayKey,

    planFingerprint:
      artifact.planFingerprint,

    verificationFingerprint:
      artifact.verificationFingerprint,

    requestState:
      artifact.requestState,

    summary:
      artifact.summary,

    operationScope:
      artifact.operationScope,

    blockers:
      artifact.blockers,

    authority:
      artifact.authority
  };
}

export function evaluateAutonomousRepairExecutionRequestGate({
  targetVerification,
  generatedAt =
    new Date().toISOString()
} = {}) {
  if (
    validateAutonomousRepairTargetVerificationArtifact(
      targetVerification
    ) !== true
  ) {
    throw new Error(
      "autonomous_repair_execution_request_target_verification_invalid"
    );
  }

  const requestState =
    stateFromVerification(
      targetVerification
    );

  const operationScope =
    projectOperationScope(
      targetVerification.operations
    );

  const blockers =
    projectedBlockers(
      targetVerification.blockers
    );

  const requestEligible =
    requestState ===
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE;

  const summary = {
    operationCount:
      operationScope.length,

    verifiedOperationCount:
      operationScope.filter(
        row =>
          row.verified ===
            true
      ).length,

    blockedOperationCount:
      operationScope.filter(
        row =>
          row.verified !==
            true
      ).length,

    createCount:
      operationScope.filter(
        row =>
          row.mutationMode ===
            "CREATE"
      ).length,

    replaceCount:
      operationScope.filter(
        row =>
          row.mutationMode ===
            "REPLACE"
      ).length,

    blockerCount:
      blockers.length,

    requestableOperationCount:
      requestEligible
        ? operationScope.length
        : 0
  };

  const authority =
    zeroExecutionAuthority(
      requestEligible
    );

  const artifact = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_VERSION,

    dayKey:
      targetVerification.dayKey,

    generatedAt:
      String(
        generatedAt
      ),

    role:
      "derived_read_only_execution_request_gate",

    planFingerprint:
      targetVerification.planFingerprint,

    verificationFingerprint:
      targetVerification.verificationFingerprint,

    requestFingerprint:
      null,

    requestState,
    summary,
    operationScope,
    blockers,
    authority
  };

  artifact.requestFingerprint =
    sha256Value(
      fingerprintInput(
        artifact
      )
    );

  validateAutonomousRepairExecutionRequestGateArtifact(
    artifact
  );

  return artifact;
}

export function validateAutonomousRepairExecutionRequestGateArtifact(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(artifact) ||
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_VERSION ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    !clean(
      artifact.generatedAt
    ) ||
    artifact.role !==
      "derived_read_only_execution_request_gate" ||
    !VALID_SHA.test(
      clean(
        artifact.planFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.verificationFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.requestFingerprint
      )
    ) ||
    !Array.isArray(
      artifact.operationScope
    ) ||
    !Array.isArray(
      artifact.blockers
    ) ||
    !exactKeys(
      artifact,
      [
        "schema",
        "version",
        "dayKey",
        "generatedAt",
        "role",
        "planFingerprint",
        "verificationFingerprint",
        "requestFingerprint",
        "requestState",
        "summary",
        "operationScope",
        "blockers",
        "authority"
      ]
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_request_artifact_invalid"
    );
  }

  const operationIds =
    new Set();

  const targetPaths =
    new Set();

  for (
    let index = 0;
    index <
      artifact.operationScope.length;
    index +=
      1
  ) {
    const row =
      artifact.operationScope[
        index
      ];

    if (
      !exactKeys(
        row,
        [
          "operationId",
          "targetPath",
          "mutationMode",
          "preimageFingerprint",
          "verified"
        ]
      ) ||
      !VALID_OPERATION_ID.test(
        clean(
          row.operationId
        )
      ) ||
      !clean(
        row.targetPath
      ) ||
      ![
        "CREATE",
        "REPLACE"
      ].includes(
        row.mutationMode
      ) ||
      !VALID_SHA.test(
        clean(
          row.preimageFingerprint
        )
      ) ||
      typeof row.verified !==
        "boolean" ||
      operationIds.has(
        row.operationId
      ) ||
      targetPaths.has(
        row.targetPath
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_request_operation_scope_invalid"
      );
    }

    operationIds.add(
      row.operationId
    );

    targetPaths.add(
      row.targetPath
    );

    if (
      index >
        0 &&
      compareScope(
        artifact.operationScope[
          index - 1
        ],
        row
      ) >
        0
    ) {
      throw new Error(
        "autonomous_repair_execution_request_operation_order_invalid"
      );
    }
  }

  for (
    let index = 0;
    index <
      artifact.blockers.length;
    index +=
      1
  ) {
    const row =
      artifact.blockers[
        index
      ];

    if (
      !exactKeys(
        row,
        [
          "code",
          "operationId",
          "targetPath"
        ]
      ) ||
      !clean(
        row.code
      ) ||
      (
        row.operationId !==
          null &&
        !VALID_OPERATION_ID.test(
          clean(
            row.operationId
          )
        )
      ) ||
      (
        row.targetPath !==
          null &&
        !clean(
          row.targetPath
        )
      ) ||
      (
        row.operationId !==
          null &&
        !operationIds.has(
          row.operationId
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_request_blocker_invalid"
      );
    }

    if (
      index >
        0 &&
      compareBlockers(
        artifact.blockers[
          index - 1
        ],
        row
      ) >
        0
    ) {
      throw new Error(
        "autonomous_repair_execution_request_blocker_order_invalid"
      );
    }
  }

  const expectedState =
    artifact.blockers.length >
      0
      ? AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.BLOCKED
      : artifact.operationScope.length ===
          0
        ? AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.NO_ACTION
        : AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE;

  if (
    artifact.requestState !==
      expectedState
  ) {
    throw new Error(
      "autonomous_repair_execution_request_state_mismatch"
    );
  }

  if (
    expectedState ===
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE &&
    artifact.operationScope.some(
      row =>
        row.verified !==
          true
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_request_unverified_operation"
    );
  }

  const requestEligible =
    expectedState ===
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE;

  const expectedSummary = {
    operationCount:
      artifact.operationScope.length,

    verifiedOperationCount:
      artifact.operationScope.filter(
        row =>
          row.verified ===
            true
      ).length,

    blockedOperationCount:
      artifact.operationScope.filter(
        row =>
          row.verified !==
            true
      ).length,

    createCount:
      artifact.operationScope.filter(
        row =>
          row.mutationMode ===
            "CREATE"
      ).length,

    replaceCount:
      artifact.operationScope.filter(
        row =>
          row.mutationMode ===
            "REPLACE"
      ).length,

    blockerCount:
      artifact.blockers.length,

    requestableOperationCount:
      requestEligible
        ? artifact.operationScope.length
        : 0
  };

  if (
    !exactKeys(
      artifact.summary,
      [
        "operationCount",
        "verifiedOperationCount",
        "blockedOperationCount",
        "createCount",
        "replaceCount",
        "blockerCount",
        "requestableOperationCount"
      ]
    ) ||
    sha256Value(
      artifact.summary
    ) !==
      sha256Value(
        expectedSummary
      )
  ) {
    throw new Error(
      "autonomous_repair_execution_request_summary_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.authority,
      [
        "readOnly",
        "authorizationRequestEligible",
        "authorizationGranted",
        "filesystemWriteAuthorized",
        "repairAuthorized",
        "executionAuthorized",
        "rollbackExecutionAuthorized",
        "workflowMutationAuthorized"
      ]
    ) ||
    artifact.authority.readOnly !==
      true ||
    artifact.authority.authorizationRequestEligible !==
      requestEligible ||
    artifact.authority.authorizationGranted !==
      false ||
    artifact.authority.filesystemWriteAuthorized !==
      false ||
    artifact.authority.repairAuthorized !==
      false ||
    artifact.authority.executionAuthorized !==
      false ||
    artifact.authority.rollbackExecutionAuthorized !==
      false ||
    artifact.authority.workflowMutationAuthorized !==
      false
  ) {
    throw new Error(
      "autonomous_repair_execution_request_authority_invalid"
    );
  }

  if (
    sha256Value(
      fingerprintInput(
        artifact
      )
    ) !==
      artifact.requestFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_request_fingerprint_mismatch"
    );
  }

  return true;
}
