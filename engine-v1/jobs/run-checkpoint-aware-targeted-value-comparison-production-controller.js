import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  inspectAutonomousRepairProductionExecutionReadiness
} from "../core/autonomous-repair-production-execution-entrypoint.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT
} from "../core/checkpoint-aware-targeted-value-comparison-production-controller-task-action-contract.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-controller.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_VERSION =
  "1.0.0";

export function runCheckpointAwareValueComparisonProductionController({
  generatedAt =
    new Date().toISOString()
} = {}) {
  const readiness =
    inspectAutonomousRepairProductionExecutionReadiness();

  if (
    readiness.productionKernelEnabled !==
      false
  ) {
    throw new Error(
      "value_comparison_production_controller_kernel_state_outside_g1_contract"
    );
  }

  return Object.freeze({
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_SCHEMA,

    version:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_VERSION,

    mode:
      "READINESS_ONLY_PRODUCTION_KERNEL_DISABLED",

    generatedAt,

    state:
      readiness.state,

    blocked:
      true,

    blockReason:
      "PRODUCTION_KERNEL_NOT_ENABLED",

    taskActionContract:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT,

    runtimeObservation:
      Object.freeze({
        nodeExecutable:
          process.execPath,

        workingDirectory:
          process.cwd()
      }),

    productionReadiness:
      readiness,

    authority:
      Object.freeze({
        readOnly:
          true,

        authorizationIngress:
          false,

        replayConsumption:
          false,

        filesystemWrite:
          false,

        repairExecution:
          false,

        productionKernelInvocation:
          false,

        productionKernelEnablement:
          false,

        workflowMutation:
          false,

        gitMutation:
          false,

        deploy:
          false
      })
  });
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (
  isCli
) {
  try {
    const result =
      runCheckpointAwareValueComparisonProductionController();

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    if (
      result.blocked ===
        true
    ) {
      process.exitCode =
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT
          .expectedBlockedExitCode;
    }
  }
  catch (
    error
  ) {
    console.error(
      JSON.stringify(
        {
          ok:
            false,

          reason:
            String(
              error?.message ||
              error ||
              "unknown_value_comparison_production_controller_error"
            )
        },
        null,
        2
      )
    );

    process.exitCode =
      1;
  }
}
