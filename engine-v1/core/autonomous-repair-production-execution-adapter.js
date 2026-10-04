import {
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  validateAutonomousRepairSourceBoundMaterialResolution
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  createAutonomousRepairExternalExecutionStateAdapter
} from "./autonomous-repair-external-execution-state.js";

import {
  resolveAutonomousRepairProductionRoots
} from "./autonomous-repair-production-root-policy.js";

import {
  executeAutonomousRepairFilesystemTransactionProduction
} from "./autonomous-repair-production-filesystem-transaction-kernel.js";

export const AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ADAPTER_VERSION =
  "1.0.0";

const FORBIDDEN_CALLER_FILESYSTEM_KEYS =
  Object.freeze([
    "projectRoot",
    "externalStateRoot",
    "externalBackupRoot",
    "roots",
    "stateAdapter"
  ]);

const EXECUTE_KEYS =
  Object.freeze([
    "transactionPlan",
    "materialResolution"
  ]);

function exactInput(
  value,
  allowedKeys
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "autonomous_repair_production_execution_adapter_input_object_required"
    );
  }

  for (
    const key of
      FORBIDDEN_CALLER_FILESYSTEM_KEYS
  ) {
    if (
      Object.prototype.hasOwnProperty.call(
        value,
        key
      )
    ) {
      throw new Error(
        "autonomous_repair_production_execution_adapter_caller_filesystem_authority_forbidden"
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
      "autonomous_repair_production_execution_adapter_input_keys_invalid"
    );
  }

  return value;
}

function validatePreparedExecutionArtifacts(
  transactionPlan,
  materialResolution
) {
  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  validateAutonomousRepairSourceBoundMaterialResolution(
    materialResolution
  );

  return true;
}

function createTrustedProductionStateAdapter() {
  const roots =
    resolveAutonomousRepairProductionRoots();

  return createAutonomousRepairExternalExecutionStateAdapter({
    externalStateRoot:
      roots.externalStateRoot,
    projectRoot:
      roots.projectRoot
  });
}

export function executeAutonomousRepairProductionExecutionAdapter(
  input
) {
  const {
    transactionPlan,
    materialResolution
  } =
    exactInput(
      input,
      EXECUTE_KEYS
    );

  validatePreparedExecutionArtifacts(
    transactionPlan,
    materialResolution
  );

  const stateAdapter =
    createTrustedProductionStateAdapter();

  return executeAutonomousRepairFilesystemTransactionProduction({
    transactionPlan,
    materialResolution,
    stateAdapter
  });
}
