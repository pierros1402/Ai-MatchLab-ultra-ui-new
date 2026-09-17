import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS
} from "./autonomous-repair-authorization-trusted-public-keys.js";

import {
  validateAutonomousRepairExecutionAuthorizationV2Artifact
} from "./autonomous-repair-execution-authorization-v2.js";

import {
  verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust
} from "./autonomous-repair-execution-authorization-v2-binding.js";

import {
  buildAutonomousRepairExecutionTransactionPlan,
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

export const AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ENTRYPOINT_SCHEMA =
  "ai-matchlab.autonomous-repair-production-execution-entrypoint.v1";

export const AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ENTRYPOINT_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE =
  Object.freeze({
    BLOCKED_NO_PINNED_TRUST:
      "BLOCKED_NO_PINNED_TRUST",

    BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED:
      "BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED"
  });

function exactKeys(
  value,
  expected,
  label
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw new Error(
      `${label}_object_required`
    );
  }

  const actual =
    Object.keys(
      value
    ).sort();

  const wanted =
    [...expected]
      .sort();

  if (
    JSON.stringify(
      actual
    ) !==
    JSON.stringify(
      wanted
    )
  ) {
    throw new Error(
      `${label}_keys_invalid`
    );
  }
}

function emptyAuthority() {
  return {
    readOnly:
      true,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    rollbackExecutionAuthorized:
      false,

    replayConsumptionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };
}

export function inspectAutonomousRepairProductionExecutionReadiness() {
  const trustedKeyCount =
    AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS.length;

  const state =
    trustedKeyCount ===
      0
      ? AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_NO_PINNED_TRUST
      : AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED;

  return Object.freeze({
    schema:
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ENTRYPOINT_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ENTRYPOINT_VERSION,

    state,

    trustedKeyCount,

    pinnedTrustRequired:
      true,

    callerSuppliedTrustForbidden:
      true,

    callerSuppliedProjectRootForbidden:
      true,

    productionKernelEnabled:
      false,

    authority:
      Object.freeze(
        emptyAuthority()
      )
  });
}

export function prepareAutonomousRepairProductionExecutionWithPinnedTrust(
  options = {}
) {
  exactKeys(
    options,
    [
      "authorization",
      "executionRequest",
      "targetVerification",
      "materialResolution",
      "generatedAt",
      "now"
    ],
    "autonomous_repair_production_execution_preflight_input"
  );

  const {
    authorization,
    executionRequest,
    targetVerification,
    materialResolution,
    generatedAt,
    now
  } =
    options;

  validateAutonomousRepairExecutionAuthorizationV2Artifact(
    authorization
  );

  verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust({
    authorization,
    executionRequest,
    targetVerification,
    materialResolution,
    now
  });

  const transactionPlan =
    buildAutonomousRepairExecutionTransactionPlan({
      authorization,
      executionRequest,
      targetVerification,
      materialResolution,
      generatedAt
    });

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  return Object.freeze({
    ready:
      true,

    transactionPlan,

    authority:
      Object.freeze(
        emptyAuthority()
      )
  });
}

export function executeAutonomousRepairProductionExecution(
  options = {}
) {
  prepareAutonomousRepairProductionExecutionWithPinnedTrust(
    options
  );

  throw new Error(
    "autonomous_repair_production_execution_kernel_not_enabled"
  );
}
