import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash
} from "node:crypto";

import {
  buildCheckpointAwareValueComparisonSourceBoundMaterialResolution
} from "../core/checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter.js";

import {
  checkpointAwareValueComparisonTransactionPlanFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE,
  checkpointAwareValueComparisonExternalJournalFingerprint,
  createCheckpointAwareValueComparisonExternalStateSandboxAdapter,
  recoverCheckpointAwareValueComparisonCrashSandbox,
  stageCheckpointAwareValueComparisonCrashSandbox,
  validateCheckpointAwareValueComparisonExternalStateSandboxRoots
} from "../core/checkpoint-aware-targeted-value-comparison-external-state-crash-recovery.js";

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
    }
  ];
}

function materialResolution({
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

function roots(
  label
) {
  const projectRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `aiml-r19-project-${label}-`
      )
    );

  const externalStateRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `aiml-r19-state-${label}-`
      )
    );

  return {
    projectRoot,
    externalStateRoot
  };
}

function materializePreimages({
  projectRoot,
  transactionPlan,
  b
}) {
  const byPath =
    new Map([
      [
        `data/value-comparison/${DAY}.json`,
        b.dayBefore
      ],
      [
        "data/value-comparison/cumulative.json",
        b.cumulativeBefore
      ]
    ]);

  for (
    const operation of
      transactionPlan.operations
  ) {
    const file =
      path.join(
        projectRoot,
        ...operation.targetPath.split(
          "/"
        )
      );

    fs.mkdirSync(
      path.dirname(
        file
      ),
      {
        recursive:
          true
      }
    );

    fs.writeFileSync(
      file,
      byPath.get(
        operation.targetPath
      )
    );
  }
}

function readTarget({
  projectRoot,
  targetPath
}) {
  return fs.readFileSync(
    path.join(
      projectRoot,
      ...targetPath.split(
        "/"
      )
    )
  );
}

function cleanup(
  value
) {
  fs.rmSync(
    value.projectRoot,
    {
      recursive:
        true,
      force:
        true
    }
  );

  fs.rmSync(
    value.externalStateRoot,
    {
      recursive:
        true,
      force:
        true
    }
  );
}

test(
  "external-state sandbox roots must be disjoint directories under the OS temp root",
  () => {
    const r =
      roots(
        "roots"
      );

    try {
      const validated =
        validateCheckpointAwareValueComparisonExternalStateSandboxRoots({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      assert.equal(
        validated.externalStateRoot,
        fs.realpathSync(
          r.externalStateRoot
        )
      );

      assert.throws(
        () =>
          validateCheckpointAwareValueComparisonExternalStateSandboxRoots({
            externalStateRoot:
              r.projectRoot,

            projectRoot:
              r.projectRoot
          }),
        /sandbox_roots_invalid/u
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "crash staging persists lock replay journal backups and one applied postimage",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "stage"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter,

          crashAfterAppliedCount:
            1
        });

      assert.equal(
        staged.simulationState,
        "CRASH_STAGED_DURABLY"
      );

      assert.equal(
        staged.appliedCount,
        1
      );

      assert.ok(
        adapter.readGlobalExecutionLock()
      );

      assert.ok(
        adapter.readReplayConsumption({
          replayKey:
            f.transactionPlan.bindings.replayKey
        })
      );

      const journal =
        adapter.readTransactionJournal({
          transactionId:
            staged.transactionId
        });

      assert.equal(
        journal.state,
        CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.APPLYING
      );

      assert.ok(
        journal.operations[0].backup
      );

      assert.equal(
        readTarget({
          projectRoot:
            r.projectRoot,

          targetPath:
            f.transactionPlan.operations[0].targetPath
        })
          .equals(
            f.b.dayAfter
          ),
        true
      );

      assert.equal(
        adapter.inspectRecoveryObligations().ready,
        false
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "crash recovery restores exact preimage writes terminal audit releases lock and keeps replay consumed",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "recover-one"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      const recovered =
        recoverCheckpointAwareValueComparisonCrashSandbox({
          transactionId:
            staged.transactionId,

          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      assert.equal(
        recovered.ok,
        true
      );

      assert.equal(
        recovered.terminalState,
        CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.ROLLED_BACK
      );

      assert.equal(
        recovered.replayRemainsConsumed,
        true
      );

      assert.equal(
        readTarget({
          projectRoot:
            r.projectRoot,

          targetPath:
            f.transactionPlan.operations[0].targetPath
        })
          .equals(
            f.b.dayBefore
          ),
        true
      );

      assert.equal(
        adapter.readGlobalExecutionLock(),
        null
      );

      assert.ok(
        adapter.readExecutionAudit({
          transactionId:
            staged.transactionId,

          terminalState:
            CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.ROLLED_BACK
        })
      );

      assert.equal(
        adapter.inspectRecoveryObligations().ready,
        true
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "single-use replay survives rollback and blocks a second transaction from reusing the authorization",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "replay"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      recoverCheckpointAwareValueComparisonCrashSandbox({
        transactionId:
          staged.transactionId,

        transactionPlan:
          f.transactionPlan,

        materialResolution:
          f.materialResolution,

        stateAdapter:
          adapter
      });

      assert.throws(
        () =>
          stageCheckpointAwareValueComparisonCrashSandbox({
            transactionPlan:
              f.transactionPlan,

            materialResolution:
              f.materialResolution,

            stateAdapter:
              adapter
          }),
        /replay_already_consumed/u
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "two-operation crash after first apply rolls the first back and preserves the second exact preimage",
  () => {
    const f =
      materialResolution({
        twoOperations:
          true
      });

    const r =
      roots(
        "recover-two"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter,

          crashAfterAppliedCount:
            1
        });

      const recovered =
        recoverCheckpointAwareValueComparisonCrashSandbox({
          transactionId:
            staged.transactionId,

          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      assert.equal(
        recovered.ok,
        true
      );

      assert.equal(
        readTarget({
          projectRoot:
            r.projectRoot,
          targetPath:
            f.transactionPlan.operations[0].targetPath
        }).equals(
          f.b.dayBefore
        ),
        true
      );

      assert.equal(
        readTarget({
          projectRoot:
            r.projectRoot,
          targetPath:
            f.transactionPlan.operations[1].targetPath
        }).equals(
          f.b.cumulativeBefore
        ),
        true
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "ambiguous target state after crash fails closed to RECOVERY_REQUIRED and retains the global lock",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "ambiguous"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      fs.writeFileSync(
        path.join(
          r.projectRoot,
          ...f.transactionPlan.operations[0].targetPath.split(
            "/"
          )
        ),
        "ambiguous\n",
        "utf8"
      );

      const recovered =
        recoverCheckpointAwareValueComparisonCrashSandbox({
          transactionId:
            staged.transactionId,

          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      assert.equal(
        recovered.ok,
        false
      );

      assert.equal(
        recovered.terminalState,
        CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.RECOVERY_REQUIRED
      );

      assert.ok(
        adapter.readGlobalExecutionLock()
      );

      assert.ok(
        adapter.readExecutionAudit({
          transactionId:
            staged.transactionId,

          terminalState:
            CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.RECOVERY_REQUIRED
        })
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "missing consumed replay evidence during recovery fails closed to RECOVERY_REQUIRED",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "missing-replay"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      fs.unlinkSync(
        path.join(
          r.externalStateRoot,
          "replay",
          `${f.transactionPlan.bindings.replayKey}.json`
        )
      );

      const recovered =
        recoverCheckpointAwareValueComparisonCrashSandbox({
          transactionId:
            staged.transactionId,

          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      assert.equal(
        recovered.ok,
        false
      );

      assert.equal(
        recovered.terminalState,
        CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE.RECOVERY_REQUIRED
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "journal static transaction identity cannot drift between atomic advances",
  () => {
    const f =
      materialResolution();

    const r =
      roots(
        "static-drift"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      const staged =
        stageCheckpointAwareValueComparisonCrashSandbox({
          transactionPlan:
            f.transactionPlan,

          materialResolution:
            f.materialResolution,

          stateAdapter:
            adapter
        });

      const journal =
        adapter.readTransactionJournal({
          transactionId:
            staged.transactionId
        });

      journal.transactionPlanFingerprint =
        "9".repeat(64);

      journal.journalFingerprint =
        checkpointAwareValueComparisonExternalJournalFingerprint(
          journal
        );

      assert.throws(
        () =>
          adapter.writeOrAdvanceTransactionJournalAtomically({
            journal
          }),
        /static_identity_drift/u
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "crash staging refuses source-bound material that is not bound to the exact transaction plan",
  () => {
    const f =
      materialResolution();

    const other =
      materialResolution();

    other.materialResolution.transactionPlanFingerprint =
      "9".repeat(64);

    const r =
      roots(
        "material-binding"
      );

    try {
      materializePreimages({
        projectRoot:
          r.projectRoot,

        transactionPlan:
          f.transactionPlan,

        b:
          f.b
      });

      const adapter =
        createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
          externalStateRoot:
            r.externalStateRoot,

          projectRoot:
            r.projectRoot
        });

      assert.throws(
        () =>
          stageCheckpointAwareValueComparisonCrashSandbox({
            transactionPlan:
              f.transactionPlan,

            materialResolution:
              other.materialResolution,

            stateAdapter:
              adapter
          }),
        /material_transaction_binding_invalid|material_fingerprint_invalid/u
      );
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "R19 observation runner contains no replay consumption signer private-key production-kernel repository writer push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-external-state-crash-recovery-sandbox-day.js",
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
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
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
        `R19 runner must not match ${pattern}`
      );
    }
  }
);
