export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-controller-task-action.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_WRAPPER_REPOSITORY_PATH =
  "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ARGUMENT =
  "jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT =
  Object.freeze({
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_SCHEMA,

    version:
      "1.0.0",

    role:
      "source_bound_windows_task_scheduler_action",

    taskExecutable:
      Object.freeze({
        resolution:
          "PROCESS_EXEC_PATH_AT_ACTIVATION_PRECHECK",

        runtimeKind:
          "NODE",

        windowsExpectedBasename:
          "node.exe",

        absolutePathRequired:
          true,

        existenceRequired:
          true
      }),

    taskArguments:
      Object.freeze([
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ARGUMENT
      ]),

    taskWorkingDirectory:
      Object.freeze({
        resolution:
          "CANONICAL_ENGINE_V1_ROOT_AT_ACTIVATION_PRECHECK",

        repositoryRelativePath:
          "engine-v1",

        absolutePathRequired:
          true,

        existenceRequired:
          true
      }),

    wrapperRepositoryRelativePath:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_WRAPPER_REPOSITORY_PATH,

    shell:
      false,

    commandLineCredentialMaterialPermitted:
      false,

    environmentCredentialMaterialPermitted:
      false,

    currentWrapperMode:
      "READINESS_ONLY_PRODUCTION_KERNEL_DISABLED",

    expectedBlockedExitCode:
      78,

    productionKernelMustRemainDisabled:
      true,

    repairExecutionAuthorized:
      false
  });
