import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash
} from "node:crypto";

import {
  buildCheckpointAwareValueComparisonSourceBoundMaterialResolution,
  checkpointAwareValueComparisonSourceBoundMaterialFingerprint,
  simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox,
  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution
} from "../core/checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter.js";

import {
  checkpointAwareValueComparisonTransactionPlanFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sha256(
  buffer
) {
  return createHash(
    "sha256"
  )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function buffers() {
  return {
    dayBefore:
      Buffer.from(
        "{\"day\":\"before\"}\n",
        "utf8"
      ),

    dayAfter:
      Buffer.from(
        "{\"day\":\"after\"}\n",
        "utf8"
      ),

    cumulativeBefore:
      Buffer.from(
        "{\"cumulative\":\"before\"}\n",
        "utf8"
      ),

    cumulativeAfter:
      Buffer.from(
        "{\"cumulative\":\"after\"}\n",
        "utf8"
      )
  };
}

function plan({
  twoOperations = false
} = {}) {
  const b =
    buffers();

  const operations = [
    {
      operationId:
        "vcrop_v1_" +
        "1".repeat(24),

      targetPath:
        `data/value-comparison/${DAY}.json`,

      mutationMode:
        "REPLACE",

      preimage: {
        sha256:
          sha256(
            b.dayBefore
          ),
        bytes:
          b.dayBefore.length,
        reverifiedCurrent:
          true
      },

      postimage: {
        contentSha256:
          sha256(
            b.dayAfter
          ),
        contentBytes:
          b.dayAfter.length,
        materialBindingState:
          "HASH_AND_SIZE_ONLY_REMATERIALIZATION_REQUIRED"
      },

      rollback: {
        sha256:
          sha256(
            b.dayBefore
          ),
        bytes:
          b.dayBefore.length
      }
    }
  ];

  if (
    twoOperations
  ) {
    operations.push({
      operationId:
        "vcrop_v1_" +
        "2".repeat(24),

      targetPath:
        "data/value-comparison/cumulative.json",

      mutationMode:
        "REPLACE",

      preimage: {
        sha256:
          sha256(
            b.cumulativeBefore
          ),
        bytes:
          b.cumulativeBefore.length,
        reverifiedCurrent:
          true
      },

      postimage: {
        contentSha256:
          sha256(
            b.cumulativeAfter
          ),
        contentBytes:
          b.cumulativeAfter.length,
        materialBindingState:
          "HASH_AND_SIZE_ONLY_REMATERIALIZATION_REQUIRED"
      },

      rollback: {
        sha256:
          sha256(
            b.cumulativeBefore
          ),
        bytes:
          b.cumulativeBefore.length
      }
    });
  }

  const artifact = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-execution-transaction-plan.v1",

    version:
      "1.0.0",

    role:
      "derived_read_only_value_comparison_execution_transaction_plan",

    dayKey:
      DAY,

    repairClass:
      "REBUILD_VALUE_COMPARISON_ONLY",

    bindings: {
      authorizationId:
        "vcrauth_v1_0123456789abcdef0123456789abcdef",

      authorizationFingerprint:
        "a".repeat(64),

      nonce:
        "vcrnonce_v1_" +
        "b".repeat(64),

      replayKey:
        "c".repeat(64),

      remoteHead:
        HEAD,

      controllerDecisionFingerprint:
        "d".repeat(64),

      executorContractFingerprint:
        "e".repeat(64),

      mutationPreflightFingerprint:
        "f".repeat(64),

      candidateSetFingerprint:
        "1".repeat(64)
    },

    exactTargetUniverse: [
      `data/value-comparison/${DAY}.json`,
      "data/value-comparison/cumulative.json"
    ],

    summary: {
      operationCount:
        operations.length,

      replaceCount:
        operations.length
    },

    operations,

    replayContract: {
      schema:
        "ai-matchlab.checkpoint-aware-value-comparison-replay-contract.v1",

      ledgerLocation:
        "outside_repository_and_planning_pipeline",

      replayKeyInputs: [
        "authorizationId",
        "nonce",
        "authorizationFingerprint"
      ],

      sha256Derived:
        true,

      atomicConsumeRequired:
        true,

      consumptionState:
        "NOT_CONSUMED_READ_ONLY_PLAN",

      releaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true
    },

    safety: {
      allOrNothingRequired:
        true,

      preimageReverificationRequired:
        true,

      postimageMaterialRematerializationRequired:
        true,

      exactPostimageVerificationRequiredAfterMaterialization:
        true,

      externalGlobalLockRequired:
        true,

      durableExternalJournalRequired:
        true,

      verifiedBackupRequired:
        true,

      reverseRollbackRequired:
        true,

      crashRecoveryRollbackOnly:
        true,

      partialExecutionForbidden:
        true
    },

    authority: {
      readOnly:
        true,

      replayConsumptionAuthorized:
        false,

      authorizationGranted:
        false,

      postimageMaterialResolutionAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      signerUseAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false
    }
  };

  artifact.transactionPlanFingerprint =
    checkpointAwareValueComparisonTransactionPlanFingerprint(
      artifact
    );

  return artifact;
}

function producerBindings() {
  return [
    {
      ref:
        "data/value-comparison/historical-exclusions.json",
      kind:
        "DATA_INPUT",
      sha256:
        "1".repeat(64),
      bytes:
        100
    },
    {
      ref:
        "engine-v1/jobs/build-value-comparison-cumulative.js",
      kind:
        "SOURCE_CODE",
      sha256:
        "2".repeat(64),
      bytes:
        200
    },
    {
      ref:
        "engine-v1/jobs/build-value-plan-comparison-day.js",
      kind:
        "SOURCE_CODE",
      sha256:
        "3".repeat(64),
      bytes:
        300
    },
    {
      ref:
        "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js",
      kind:
        "SOURCE_CODE",
      sha256:
        "4".repeat(64),
      bytes:
        400
    }
  ];
}

function resolution({
  twoOperations = false
} = {}) {
  const transactionPlan =
    plan({
      twoOperations
    });

  const b =
    buffers();

  const materials = [
    {
      targetPath:
        `data/value-comparison/${DAY}.json`,
      contentBuffer:
        b.dayAfter
    }
  ];

  if (
    twoOperations
  ) {
    materials.push({
      targetPath:
        "data/value-comparison/cumulative.json",
      contentBuffer:
        b.cumulativeAfter
    });
  }

  return {
    transactionPlan,
    materialResolution:
      buildCheckpointAwareValueComparisonSourceBoundMaterialResolution({
        transactionPlan,
        producerBindings:
          producerBindings(),
        materials
      }),
    b
  };
}

function sandboxPath(
  label
) {
  return path.join(
    os.tmpdir(),
    `aiml-r18-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

test(
  "source-bound material resolution accepts exact transaction-bound postimage bytes and fingerprints provenance",
  () => {
    const f =
      resolution();

    assert.equal(
      validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
        f.materialResolution
      ),
      true
    );

    assert.equal(
      f.materialResolution.materials.length,
      1
    );

    assert.equal(
      f.materialResolution.materialResolutionFingerprint,
      checkpointAwareValueComparisonSourceBoundMaterialFingerprint(
        f.materialResolution
      )
    );

    assert.equal(
      f.materialResolution.authority.repairExecutionAuthorized,
      false
    );
  }
);

test(
  "source-bound material resolution fails closed on postimage hash drift",
  () => {
    const transactionPlan =
      plan();

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonSourceBoundMaterialResolution({
          transactionPlan,

          producerBindings:
            producerBindings(),

          materials: [
            {
              targetPath:
                `data/value-comparison/${DAY}.json`,

              contentBuffer:
                Buffer.from(
                  "wrong\n",
                  "utf8"
                )
            }
          ]
        }),
      /candidate_mismatch/u
    );
  }
);

test(
  "source-bound material resolution requires exact coverage of every transaction operation",
  () => {
    const transactionPlan =
      plan({
        twoOperations:
          true
      });

    const b =
      buffers();

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonSourceBoundMaterialResolution({
          transactionPlan,

          producerBindings:
            producerBindings(),

          materials: [
            {
              targetPath:
                `data/value-comparison/${DAY}.json`,
              contentBuffer:
                b.dayAfter
            }
          ]
        }),
      /operation_count_mismatch/u
    );
  }
);

test(
  "dedicated sandbox adapter applies one source-bound operation and restores both exact preimages",
  () => {
    const f =
      resolution();

    const root =
      sandboxPath(
        "one"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          preimageBuffersByTarget: {
            [`data/value-comparison/${DAY}.json`]:
              f.b.dayBefore,

            "data/value-comparison/cumulative.json":
              f.b.cumulativeBefore
          },

          sandboxRoot:
            root
        });

      assert.equal(
        result.simulationState,
        "SIMULATED_AND_ROLLED_BACK"
      );

      assert.equal(
        result.simulation.forwardAppliedCount,
        1
      );

      assert.equal(
        result.simulation.rollbackVerified,
        true
      );

      assert.equal(
        result.authority.productionRepositoryTarget,
        false
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);

test(
  "dedicated sandbox adapter keeps two-operation execution all-or-nothing and fully rolled back",
  () => {
    const f =
      resolution({
        twoOperations:
          true
      });

    const root =
      sandboxPath(
        "two"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          preimageBuffersByTarget: {
            [`data/value-comparison/${DAY}.json`]:
              f.b.dayBefore,

            "data/value-comparison/cumulative.json":
              f.b.cumulativeBefore
          },

          sandboxRoot:
            root
        });

      assert.equal(
        result.simulation.forwardAppliedCount,
        2
      );

      assert.equal(
        result.simulation.rollbackVerified,
        true
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);

test(
  "injected partial failure through dedicated adapter verifies reverse rollback",
  () => {
    const f =
      resolution({
        twoOperations:
          true
      });

    const root =
      sandboxPath(
        "failure"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          preimageBuffersByTarget: {
            [`data/value-comparison/${DAY}.json`]:
              f.b.dayBefore,

            "data/value-comparison/cumulative.json":
              f.b.cumulativeBefore
          },

          sandboxRoot:
            root,

          injectFailureAfterOperation:
            1
        });

      assert.equal(
        result.simulationState,
        "INJECTED_FAILURE_ROLLED_BACK"
      );

      assert.equal(
        result.simulation.rollbackVerified,
        true
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);

test(
  "dedicated adapter fails closed when a current preimage buffer no longer matches the plan",
  () => {
    const f =
      resolution();

    const root =
      sandboxPath(
        "drift"
      );

    assert.throws(
      () =>
        simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          preimageBuffersByTarget: {
            [`data/value-comparison/${DAY}.json`]:
              Buffer.from(
                "drift\n",
                "utf8"
              ),

            "data/value-comparison/cumulative.json":
              f.b.cumulativeBefore
          },

          sandboxRoot:
            root
        }),
      /preimage_identity_mismatch/u
    );

    assert.equal(
      fs.existsSync(
        root
      ),
      false
    );
  }
);

test(
  "source-bound runner imports canonical producers and canonical semantic normalizer directly",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter-sandbox-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const required of [
        'from "./build-value-plan-comparison-day.js"',
        'from "./build-value-comparison-cumulative.js"',
        'from "./run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js"',
        "canonicalCandidateBuffer",
        "rematerializeCheckpointAwareValueComparisonPostimagesFromBoundSources"
      ]
    ) {
      assert.equal(
        source.includes(
          required
        ),
        true,
        `R18 runner must contain ${required}`
      );
    }
  }
);

test(
  "R18 runner contains no replay consumption signer private-key production-kernel push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter-sandbox-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bexecuteAutonomousRepairProductionExecution\b/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\b/u,
      /\bgit\s+push\b/u,
      /\bgit\s+commit\b/u,
      /\bworkflow_dispatch\b/u,
      /\bRENDER_/u
    ];

    for (
      const pattern of
        forbiddenPatterns
    ) {
      assert.equal(
        pattern.test(
          source
        ),
        false,
        `R18 runner must not match ${pattern}`
      );
    }
  }
);
