import {
  AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE,
  validateAutonomousRepairExecutionRequestGateArtifact
} from "./autonomous-repair-execution-request-gate.js";

import {
  AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE,
  validateAutonomousRepairTargetVerificationArtifact
} from "./autonomous-repair-target-verifier.js";

import {
  AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE,
  validateAutonomousRepairSourceBoundMaterialResolution
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE,
  validateAutonomousRepairExecutionAuthorizationV2Artifact,
  verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord,
  verifyAutonomousRepairExecutionAuthorizationV2WithPinnedTrust
} from "./autonomous-repair-execution-authorization-v2.js";

import {
  deriveAutonomousRepairAuthorizationReplayKey
} from "./autonomous-repair-authorization-replay-contract.js";

function clean(value) {
  return String(value ?? "").trim();
}

function compareScope(a, b) {
  return [
    a.targetPath,
    a.operationId ?? ""
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.targetPath,
        b.operationId ?? ""
      ].join("\u0000")
    );
}

function sameTextArray(a, b) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index]
    )
  );
}

function materialTargetScope(
  materialResolution
) {
  validateAutonomousRepairSourceBoundMaterialResolution(
    materialResolution
  );

  if (
    materialResolution.state !==
      AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE.RESOLVED ||
    materialResolution.blockers.length !== 0 ||
    materialResolution.candidateDecisionIds.length === 0
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_material_not_resolved"
    );
  }

  const resolutionByDecisionId =
    new Map(
      materialResolution.resolutions.map(
        row => [
          row.candidateDecisionId,
          row
        ]
      )
    );

  const rows = [];
  const targetPaths = new Set();

  for (
    const candidateDecisionId of
      materialResolution.candidateDecisionIds
  ) {
    const resolution =
      resolutionByDecisionId.get(
        candidateDecisionId
      );

    const targets =
      materialResolution.targetsByDecisionId[
        candidateDecisionId
      ];

    if (
      !resolution ||
      !Array.isArray(targets) ||
      targets.length === 0
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_v2_material_scope_invalid"
      );
    }

    for (const target of targets) {
      const targetPath =
        clean(target?.targetPath);

      if (
        !targetPath ||
        targetPaths.has(targetPath) ||
        typeof target.targetExists !==
          "boolean" ||
        (
          target.targetExists === true &&
          !/^[0-9a-f]{64}$/u.test(
            clean(target.currentSha256)
          )
        ) ||
        (
          target.targetExists === false &&
          target.currentSha256 !== null
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_authorization_v2_material_scope_invalid"
        );
      }

      targetPaths.add(targetPath);

      rows.push({
        candidateDecisionId,
        targetPath,
        repairClass:
          resolution.repairClass,
        targetExists:
          target.targetExists,
        currentSha256:
          target.currentSha256,
        mutationMode:
          target.targetExists
            ? "REPLACE"
            : "CREATE"
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.targetPath.localeCompare(
        b.targetPath
      )
  );
}

function exactRequestAndVerificationScope({
  executionRequest,
  targetVerification
}) {
  validateAutonomousRepairExecutionRequestGateArtifact(
    executionRequest
  );

  validateAutonomousRepairTargetVerificationArtifact(
    targetVerification
  );

  if (
    executionRequest.requestState !==
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE ||
    executionRequest.authority.authorizationRequestEligible !== true ||
    executionRequest.blockers.length !== 0 ||
    executionRequest.operationScope.length === 0 ||
    executionRequest.operationScope.some(
      row =>
        row.verified !== true
    ) ||
    targetVerification.verificationState !==
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED ||
    targetVerification.blockers.length !== 0 ||
    targetVerification.operations.length === 0 ||
    targetVerification.operations.some(
      row =>
        row.verified !== true
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_request_not_execution_ready"
    );
  }

  if (
    executionRequest.dayKey !==
      targetVerification.dayKey ||
    executionRequest.planFingerprint !==
      targetVerification.planFingerprint ||
    executionRequest.verificationFingerprint !==
      targetVerification.verificationFingerprint ||
    executionRequest.operationScope.length !==
      targetVerification.operations.length
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_request_verification_binding_mismatch"
    );
  }

  const verificationByTarget =
    new Map(
      targetVerification.operations.map(
        row => [
          row.targetPath,
          row
        ]
      )
    );

  for (
    const requestRow of
      executionRequest.operationScope
  ) {
    const verificationRow =
      verificationByTarget.get(
        requestRow.targetPath
      );

    if (
      !verificationRow ||
      verificationRow.operationId !==
        requestRow.operationId ||
      verificationRow.mutationMode !==
        requestRow.mutationMode ||
      verificationRow.preimageFingerprint !==
        requestRow.preimageFingerprint ||
      verificationRow.verified !== true
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_v2_request_verification_scope_mismatch"
      );
    }
  }

  return [...executionRequest.operationScope]
    .sort(compareScope);
}

export function validateAutonomousRepairExecutionAuthorizationV2Binding({
  authorization,
  executionRequest,
  targetVerification,
  materialResolution
} = {}) {
  validateAutonomousRepairExecutionAuthorizationV2Artifact(
    authorization
  );

  const requestScope =
    exactRequestAndVerificationScope({
      executionRequest,
      targetVerification
    });

  const materialScope =
    materialTargetScope(
      materialResolution
    );

  if (
    authorization?.authorizationState !==
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE.AUTHORIZED ||
    authorization.dayKey !==
      executionRequest.dayKey ||
    authorization.dayKey !==
      materialResolution.dayKey ||
    authorization.bindings?.requestFingerprint !==
      executionRequest.requestFingerprint ||
    authorization.bindings?.planFingerprint !==
      executionRequest.planFingerprint ||
    authorization.bindings?.verificationFingerprint !==
      executionRequest.verificationFingerprint ||
    authorization.bindings?.materialResolutionFingerprint !==
      materialResolution.resolutionFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_artifact_binding_mismatch"
    );
  }

  if (
    requestScope.length !==
      materialScope.length ||
    authorization.operationScope.length !==
      requestScope.length
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_exact_target_set_mismatch"
    );
  }

  const materialByTarget =
    new Map(
      materialScope.map(
        row => [
          row.targetPath,
          row
        ]
      )
    );

  const verificationByTarget =
    new Map(
      targetVerification.operations.map(
        row => [
          row.targetPath,
          row
        ]
      )
    );

  const authorizationByTarget =
    new Map(
      authorization.operationScope.map(
        row => [
          row.targetPath,
          row
        ]
      )
    );

  const derivedRepairClasses = [];

  for (const requestRow of requestScope) {
    const materialRow =
      materialByTarget.get(
        requestRow.targetPath
      );

    const verificationRow =
      verificationByTarget.get(
        requestRow.targetPath
      );

    const authorizationRow =
      authorizationByTarget.get(
        requestRow.targetPath
      );

    if (
      !materialRow ||
      !verificationRow ||
      !authorizationRow ||
      materialRow.mutationMode !==
        requestRow.mutationMode ||
      materialRow.targetExists !==
        verificationRow.targetExists ||
      materialRow.currentSha256 !==
        verificationRow.actualSha256 ||
      authorizationRow.operationId !==
        requestRow.operationId ||
      authorizationRow.mutationMode !==
        requestRow.mutationMode ||
      authorizationRow.preimageFingerprint !==
        requestRow.preimageFingerprint ||
      authorizationRow.repairClass !==
        materialRow.repairClass
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_v2_exact_operation_binding_mismatch"
      );
    }

    derivedRepairClasses.push(
      materialRow.repairClass
    );
  }

  const exactRepairClassScope =
    Array.from(
      new Set(
        derivedRepairClasses
      )
    ).sort();

  if (
    !sameTextArray(
      authorization.repairClassScope,
      exactRepairClassScope
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_exact_repair_class_scope_mismatch"
    );
  }

  const replayKey =
    deriveAutonomousRepairAuthorizationReplayKey({
      authorizationId:
        authorization.authorizationId,
      nonce:
        authorization.nonce,
      authorizationFingerprint:
        authorization.authorizationFingerprint
    });

  return {
    ok:
      true,

    dayKey:
      authorization.dayKey,

    operationCount:
      authorization.operationScope.length,

    repairClassScope:
      [...authorization.repairClassScope],

    requestFingerprint:
      authorization.bindings.requestFingerprint,

    planFingerprint:
      authorization.bindings.planFingerprint,

    verificationFingerprint:
      authorization.bindings.verificationFingerprint,

    materialResolutionFingerprint:
      authorization.bindings.materialResolutionFingerprint,

    authorizationFingerprint:
      authorization.authorizationFingerprint,

    replayKey
  };
}

export function verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
  authorization,
  executionRequest,
  targetVerification,
  materialResolution,
  trustedKeyRecord,
  now
} = {}) {
  verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
    authorization,
    trustedKeyRecord,
    now
  });

  return validateAutonomousRepairExecutionAuthorizationV2Binding({
    authorization,
    executionRequest,
    targetVerification,
    materialResolution
  });
}

export function verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust({
  authorization,
  executionRequest,
  targetVerification,
  materialResolution,
  now
} = {}) {
  verifyAutonomousRepairExecutionAuthorizationV2WithPinnedTrust({
    authorization,
    now
  });

  return validateAutonomousRepairExecutionAuthorizationV2Binding({
    authorization,
    executionRequest,
    targetVerification,
    materialResolution
  });
}
