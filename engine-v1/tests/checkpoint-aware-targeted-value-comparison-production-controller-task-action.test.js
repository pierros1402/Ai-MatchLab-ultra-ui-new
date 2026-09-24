import fs from "node:fs";
import path from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  fileURLToPath
} from "node:url";

import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT,
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_WRAPPER_REPOSITORY_PATH
} from "../core/checkpoint-aware-targeted-value-comparison-production-controller-task-action-contract.js";

import {
  runCheckpointAwareValueComparisonProductionController
} from "../jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js";

test(
  "G1 task-action contract binds the stable production controller wrapper without credentials",
  () => {
    const contract =
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT;

    assert.equal(
      contract.taskExecutable.resolution,
      "PROCESS_EXEC_PATH_AT_ACTIVATION_PRECHECK"
    );

    assert.equal(
      contract.taskExecutable.runtimeKind,
      "NODE"
    );

    assert.equal(
      contract.taskExecutable.windowsExpectedBasename,
      "node.exe"
    );

    assert.deepEqual(
      contract.taskArguments,
      [
        "jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js"
      ]
    );

    assert.equal(
      contract.taskWorkingDirectory.resolution,
      "CANONICAL_ENGINE_V1_ROOT_AT_ACTIVATION_PRECHECK"
    );

    assert.equal(
      contract.taskWorkingDirectory.repositoryRelativePath,
      "engine-v1"
    );

    assert.equal(
      contract.wrapperRepositoryRelativePath,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_WRAPPER_REPOSITORY_PATH
    );

    assert.equal(
      contract.commandLineCredentialMaterialPermitted,
      false
    );

    assert.equal(
      contract.environmentCredentialMaterialPermitted,
      false
    );

    assert.equal(
      contract.productionKernelMustRemainDisabled,
      true
    );

    assert.equal(
      contract.repairExecutionAuthorized,
      false
    );
  }
);

test(
  "G1 production controller wrapper reports the existing production core as kernel-disabled",
  () => {
    const result =
      runCheckpointAwareValueComparisonProductionController({
        generatedAt:
          "2026-09-24T20:00:00.000Z"
      });

    assert.equal(
      result.mode,
      "READINESS_ONLY_PRODUCTION_KERNEL_DISABLED"
    );

    assert.equal(
      result.blocked,
      true
    );

    assert.equal(
      result.blockReason,
      "PRODUCTION_KERNEL_NOT_ENABLED"
    );

    assert.equal(
      result.productionReadiness.productionKernelEnabled,
      false
    );

    assert.equal(
      result.authority.readOnly,
      true
    );

    for (
      const key of [
        "authorizationIngress",
        "replayConsumption",
        "filesystemWrite",
        "repairExecution",
        "productionKernelInvocation",
        "productionKernelEnablement",
        "workflowMutation",
        "gitMutation",
        "deploy"
      ]
    ) {
      assert.equal(
        result.authority[key],
        false,
        key
      );
    }
  }
);

test(
  "G1 production controller wrapper contains no execution kernel signer private-key or filesystem mutation surface",
  () => {
    const file =
      fileURLToPath(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js",
          import.meta.url
        )
      );

    const source =
      fs.readFileSync(
        file,
        "utf8"
      );

    for (
      const forbidden of [
        "executeAutonomousRepairProductionExecution",
        "prepareAutonomousRepairProductionExecutionWithPinnedTrust",
        "node:fs",
        "autonomous-repair-filesystem-transaction-kernel",
        "consumeOnceAtomically",
        "privateKey",
        "createPrivateKey",
        "generateKeyPair",
        "sign(",
        "Register-ScheduledTask",
        "Enable-LocalUser",
        "Set-LocalUser",
        "secedit.exe",
        "git push",
        "workflow_dispatch",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }

    assert.equal(
      source.includes(
        "inspectAutonomousRepairProductionExecutionReadiness"
      ),
      true
    );
  }
);

test(
  "G1 production controller CLI exits fail-closed with the task contract blocked exit code",
  () => {
    const wrapper =
      fileURLToPath(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-controller.js",
          import.meta.url
        )
      );

    const run =
      spawnSync(
        process.execPath,
        [
          wrapper
        ],
        {
          cwd:
            path.resolve(
              path.dirname(
                wrapper
              ),
              ".."
            ),

          encoding:
            "utf8"
        }
      );

    assert.equal(
      run.status,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONTROLLER_TASK_ACTION_CONTRACT
        .expectedBlockedExitCode
    );

    assert.equal(
      run.stderr,
      ""
    );

    const payload =
      JSON.parse(
        run.stdout
      );

    assert.equal(
      payload.blocked,
      true
    );

    assert.equal(
      payload.productionReadiness.productionKernelEnabled,
      false
    );

    assert.equal(
      payload.authority.repairExecution,
      false
    );
  }
);
