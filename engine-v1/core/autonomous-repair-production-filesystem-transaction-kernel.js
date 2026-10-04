import {
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  executeAutonomousRepairFilesystemTransactionCore,
  recoverAutonomousRepairFilesystemTransactionCore
} from "./autonomous-repair-filesystem-transaction-core.js";

import {
  resolveAutonomousRepairProductionRoots,
  resolveAutonomousRepairProductionTarget
} from "./autonomous-repair-production-root-policy.js";

export const AUTONOMOUS_REPAIR_PRODUCTION_FILESYSTEM_TRANSACTION_KERNEL_VERSION =
  "1.0.0";

const FORBIDDEN_CALLER_ROOT_KEYS =
  Object.freeze([
    "projectRoot",
    "externalStateRoot",
    "externalBackupRoot",
    "roots"
  ]);

const EXECUTE_KEYS =
  Object.freeze([
    "transactionPlan",
    "materialResolution",
    "stateAdapter"
  ]);

const RECOVER_KEYS =
  Object.freeze([
    "transactionId",
    "transactionPlan",
    "materialResolution",
    "stateAdapter"
  ]);

function exactInput(
  value,
  allowedKeys,
  label
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      `autonomous_repair_production_filesystem_kernel_${label}_input_object_required`
    );
  }

  for (
    const key of
      FORBIDDEN_CALLER_ROOT_KEYS
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        value,
        key
      )
    ) {
      throw new Error(
        "autonomous_repair_production_filesystem_kernel_caller_root_authority_forbidden"
      );
    }
  }

  const actualKeys =
    Object.keys(
      value
    ).sort();

  const expectedKeys =
    [...allowedKeys].sort();

  if (
    JSON.stringify(
      actualKeys
    ) !==
    JSON.stringify(
      expectedKeys
    )
  ) {
    throw new Error(
      `autonomous_repair_production_filesystem_kernel_${label}_input_keys_invalid`
    );
  }

  return value;
}

function coreRoots(
  roots
) {
  return {
    projectRoot:
      roots.projectRoot,

    externalStateRoot:
      roots.externalStateRoot,

    externalBackupRoot:
      roots.externalBackupRoot
  };
}

function validateProductionPlanTargets(
  transactionPlan,
  roots
) {
  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  for (
    const operation of
      transactionPlan.operations
  ) {
    resolveAutonomousRepairProductionTarget(
      roots,
      operation.targetPath
    );
  }

  return true;
}

export function executeAutonomousRepairFilesystemTransactionProduction(
  input
) {
  const {
    transactionPlan,
    materialResolution,
    stateAdapter
  } =
    exactInput(
      input,
      EXECUTE_KEYS,
      "execute"
    );

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  const roots =
    resolveAutonomousRepairProductionRoots();

  validateProductionPlanTargets(
    transactionPlan,
    roots
  );

  return executeAutonomousRepairFilesystemTransactionCore({
    transactionPlan,
    materialResolution,
    stateAdapter,
    roots:
      coreRoots(
        roots
      )
  });
}

export function recoverAutonomousRepairFilesystemTransactionProduction(
  input
) {
  const {
    transactionId,
    transactionPlan,
    materialResolution,
    stateAdapter
  } =
    exactInput(
      input,
      RECOVER_KEYS,
      "recover"
    );

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  const roots =
    resolveAutonomousRepairProductionRoots();

  validateProductionPlanTargets(
    transactionPlan,
    roots
  );

  return recoverAutonomousRepairFilesystemTransactionCore({
    transactionId,
    transactionPlan,
    materialResolution,
    stateAdapter,
    roots:
      coreRoots(
        roots
      )
  });
}
