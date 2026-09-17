import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateAutonomousRepairAuthorizationReplayLedgerAdapter
} from "./autonomous-repair-authorization-replay-contract.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION,
  autonomousRepairExecutionTransactionPlanFingerprint,
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE,
  autonomousRepairExecutionJournalFingerprint,
  buildAutonomousRepairExecutionPreparedJournal,
  buildAutonomousRepairExecutionTerminalAudit,
  createAutonomousRepairExternalExecutionStateAdapter,
  newAutonomousRepairExecutionTransactionId,
  validateAutonomousRepairExecutionAuditArtifact,
  validateAutonomousRepairExecutionJournalArtifact,
  validateAutonomousRepairExternalExecutionStateRoot
} from "./autonomous-repair-external-execution-state.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);
const SHA_E = "e".repeat(64);
const SHA_F = "f".repeat(64);

function transactionPlan() {
  const artifact = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA,
    version:
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION,
    dayKey:
      "2026-09-17",
    generatedAt:
      "2026-09-17T14:30:00.000Z",
    role:
      "derived_read_only_bounded_execution_transaction_plan",
    bindings: {
      authorizationId:
        "arauth_v2_" + "1".repeat(32),
      nonce:
        "arnonce_v2_" + "2".repeat(64),
      authorizationFingerprint:
        SHA_A,
      requestFingerprint:
        SHA_B,
      planFingerprint:
        SHA_C,
      verificationFingerprint:
        SHA_D,
      materialResolutionFingerprint:
        SHA_E,
      replayKey:
        SHA_F
    },
    transactionFingerprint:
      "",
    repairClassScope: [
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    ],
    summary: {
      operationCount:
        1,
      createCount:
        0,
      replaceCount:
        1,
      publicationMutationCount:
        0,
      totalPostimageBytes:
        11
    },
    operations: [
      {
        operationId:
          "arpo_v1_" + "3".repeat(24),
        candidateDecisionId:
          "arpd_v1_" + "4".repeat(24),
        repairClass:
          "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
        targetPath:
          "data/final-results/2026-09-17/example.json",
        mutationMode:
          "REPLACE",
        preimage: {
          targetExists:
            true,
          sha256:
            SHA_A,
          bytes:
            10,
          preimageFingerprint:
            SHA_B
        },
        postimage: {
          sourceKind:
            "TARGET_MATERIAL",
          materialFingerprint:
            SHA_C,
          publicationBundleFingerprint:
            null,
          publicationRole:
            null,
          contentSha256:
            SHA_D,
          contentBytes:
            11
        },
        rollback: {
          strategy:
            "RESTORE_PREIMAGE"
        }
      }
    ],
    safety: {
      pinnedTrustReverificationRequired:
        true,
      preimageReverificationRequired:
        true,
      externalGlobalLockRequired:
        true,
      atomicReplayConsumeRequired:
        true,
      durableExternalJournalRequired:
        true,
      verifiedBackupRequiredForReplace:
        true,
      fsyncedTempRequired:
        true,
      postimageVerificationRequired:
        true,
      reverseRollbackRequired:
        true,
      crashRecoveryRollbackOnly:
        true,
      allTargetsAppliedOrVerifiedRestored:
        true
    },
    authority: {
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
    }
  };

  artifact.transactionFingerprint =
    autonomousRepairExecutionTransactionPlanFingerprint(
      artifact
    );

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    artifact
  );

  return artifact;
}

function workspace() {
  const root =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-7f3b-"
      )
    );

  const projectRoot =
    path.join(
      root,
      "project"
    );

  const externalStateRoot =
    path.join(
      root,
      "external-state"
    );

  fs.mkdirSync(
    projectRoot
  );

  fs.mkdirSync(
    externalStateRoot
  );

  fs.writeFileSync(
    path.join(
      projectRoot,
      "sentinel.txt"
    ),
    "unchanged\n",
    "utf8"
  );

  return {
    root,
    projectRoot,
    externalStateRoot,
    cleanup() {
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
  };
}

function journalFor({
  transactionId =
    "artxn_v1_" + "5".repeat(32),
  updatedAt =
    "2026-09-17T14:31:00.000Z"
} = {}) {
  return buildAutonomousRepairExecutionPreparedJournal({
    transactionId,
    transactionPlan:
      transactionPlan(),
    updatedAt
  });
}

function advanceJournal(
  journal,
  state,
  updatedAt,
  mutate = null
) {
  const next =
    structuredClone(
      journal
    );

  next.state =
    state;

  next.updatedAt =
    updatedAt;

  if (mutate) {
    mutate(
      next
    );
  }

  next.journalFingerprint =
    autonomousRepairExecutionJournalFingerprint(
      next
    );

  validateAutonomousRepairExecutionJournalArtifact(
    next
  );

  return next;
}

test(
  "external execution state root must be existing absolute and disjoint from the project tree",
  () => {
    const ws =
      workspace();

    try {
      assert.deepEqual(
        validateAutonomousRepairExternalExecutionStateRoot({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        }),
        {
          externalStateRoot:
            fs.realpathSync(
              ws.externalStateRoot
            ),
          projectRoot:
            fs.realpathSync(
              ws.projectRoot
            )
        }
      );

      assert.throws(
        () =>
          validateAutonomousRepairExternalExecutionStateRoot({
            externalStateRoot:
              ws.projectRoot,
            projectRoot:
              ws.projectRoot
          }),
        /roots_not_disjoint/u
      );

      assert.throws(
        () =>
          validateAutonomousRepairExternalExecutionStateRoot({
            externalStateRoot:
              path.join(
                ws.projectRoot,
                "state"
              ),
            projectRoot:
              ws.projectRoot
          }),
        /external_root_directory_invalid|roots_not_disjoint/u
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "external state adapter satisfies the existing atomic replay ledger contract",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      assert.equal(
        validateAutonomousRepairAuthorizationReplayLedgerAdapter(
          adapter
        ),
        true
      );

      assert.equal(
        typeof adapter.consumeOnceAtomically,
        "function"
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "adapter creates only fixed execution-state directories under the external root",
  () => {
    const ws =
      workspace();

    try {
      createAutonomousRepairExternalExecutionStateAdapter({
        externalStateRoot:
          ws.externalStateRoot,
        projectRoot:
          ws.projectRoot
      });

      assert.deepEqual(
        fs.readdirSync(
          ws.externalStateRoot
        ).sort(),
        [
          "audits",
          "journals",
          "locks",
          "replay"
        ]
      );

      assert.deepEqual(
        fs.readdirSync(
          ws.projectRoot
        ).sort(),
        [
          "sentinel.txt"
        ]
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "global execution lock is exclusive and cannot be stolen",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const firstId =
        "artxn_v1_" + "5".repeat(32);

      adapter.acquireGlobalExecutionLockAtomically({
        transactionId:
          firstId,
        authorizationId:
          "arauth_v2_" + "1".repeat(32),
        transactionFingerprint:
          SHA_A,
        acquiredAt:
          "2026-09-17T14:31:00.000Z"
      });

      assert.throws(
        () =>
          adapter.acquireGlobalExecutionLockAtomically({
            transactionId:
              "artxn_v1_" + "6".repeat(32),
            authorizationId:
              "arauth_v2_" + "1".repeat(32),
            transactionFingerprint:
              SHA_A,
            acquiredAt:
              "2026-09-17T14:31:01.000Z"
          }),
        /global_lock_held/u
      );

      adapter.releaseGlobalExecutionLock({
        transactionId:
          firstId
      });
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "global execution lock may be released only by its exact transaction owner",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const owner =
        "artxn_v1_" + "5".repeat(32);

      adapter.acquireGlobalExecutionLockAtomically({
        transactionId:
          owner,
        authorizationId:
          "arauth_v2_" + "1".repeat(32),
        transactionFingerprint:
          SHA_A,
        acquiredAt:
          "2026-09-17T14:31:00.000Z"
      });

      assert.throws(
        () =>
          adapter.releaseGlobalExecutionLock({
            transactionId:
              "artxn_v1_" + "6".repeat(32)
          }),
        /lock_owner_mismatch/u
      );

      assert.equal(
        adapter.releaseGlobalExecutionLock({
          transactionId:
            owner
        }),
        true
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "PREPARED journal derives immutable target identities from the validated transaction plan",
  () => {
    const plan =
      transactionPlan();

    const journal =
      journalFor();

    assert.equal(
      journal.transactionFingerprint,
      plan.transactionFingerprint
    );

    assert.equal(
      journal.authorizationId,
      plan.bindings.authorizationId
    );

    assert.equal(
      journal.replayKey,
      plan.bindings.replayKey
    );

    assert.deepEqual(
      journal.operations[0].preimage,
      plan.operations[0].preimage
    );

    assert.deepEqual(
      journal.operations[0].postimage,
      {
        contentSha256:
          plan.operations[0].postimage.contentSha256,
        contentBytes:
          plan.operations[0].postimage.contentBytes
      }
    );

    assert.equal(
      journal.operations[0].backup,
      null
    );

    assert.equal(
      journal.operations[0].temp,
      null
    );

    assert.equal(
      journal.operations[0].applied,
      false
    );

    assert.equal(
      journal.operations[0].restored,
      false
    );
  }
);

test(
  "journal initial persistence requires PREPARED and reads back byte-verified state",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const journal =
        journalFor();

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal
      });

      assert.deepEqual(
        adapter.readTransactionJournal({
          transactionId:
            journal.transactionId
        }),
        journal
      );

      const invalid =
        advanceJournal(
          journal,
          "REPLAY_CONSUMED",
          "2026-09-17T14:32:00.000Z"
        );

      const ws2 =
        workspace();

      try {
        const adapter2 =
          createAutonomousRepairExternalExecutionStateAdapter({
            externalStateRoot:
              ws2.externalStateRoot,
            projectRoot:
              ws2.projectRoot
          });

        assert.throws(
          () =>
            adapter2.writeOrAdvanceTransactionJournalAtomically({
              journal:
                invalid
            }),
          /initial_state_invalid/u
        );
      } finally {
        ws2.cleanup();
      }
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "journal permits only declared state transitions and rejects static identity drift",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const prepared =
        journalFor();

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          prepared
      });

      const replayConsumed =
        advanceJournal(
          prepared,
          "REPLAY_CONSUMED",
          "2026-09-17T14:32:00.000Z"
        );

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          replayConsumed
      });

      const illegal =
        advanceJournal(
          replayConsumed,
          "TEMPS_VERIFIED",
          "2026-09-17T14:33:00.000Z"
        );

      assert.throws(
        () =>
          adapter.writeOrAdvanceTransactionJournalAtomically({
            journal:
              illegal
          }),
        /transition_invalid/u
      );

      const drift =
        advanceJournal(
          replayConsumed,
          "BACKUPS_VERIFIED",
          "2026-09-17T14:33:00.000Z",
          next => {
            next.operations[0].postimage.contentBytes +=
              1;
          }
        );

      assert.throws(
        () =>
          adapter.writeOrAdvanceTransactionJournalAtomically({
            journal:
              drift
          }),
        /static_identity_drift/u
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "APPLYING same-state journal updates may record monotonic target progress",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      let journal =
        journalFor();

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal
      });

      for (
        const [state, timestamp] of
          [
            ["REPLAY_CONSUMED", "2026-09-17T14:32:00.000Z"],
            ["BACKUPS_VERIFIED", "2026-09-17T14:33:00.000Z"],
            ["TEMPS_VERIFIED", "2026-09-17T14:34:00.000Z"],
            ["APPLYING", "2026-09-17T14:35:00.000Z"]
          ]
      ) {
        journal =
          advanceJournal(
            journal,
            state,
            timestamp
          );

        adapter.writeOrAdvanceTransactionJournalAtomically({
          journal
        });
      }

      journal =
        advanceJournal(
          journal,
          "APPLYING",
          "2026-09-17T14:35:01.000Z",
          next => {
            next.operations[0].applied =
              true;
          }
        );

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal
      });

      assert.equal(
        adapter
          .readTransactionJournal({
            transactionId:
              journal.transactionId
          })
          .operations[0]
          .applied,
        true
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "journal cannot regress applied or restored target progress",
  () => {
    const before =
      advanceJournal(
        advanceJournal(
          advanceJournal(
            advanceJournal(
              journalFor(),
              "REPLAY_CONSUMED",
              "2026-09-17T14:32:00.000Z"
            ),
            "BACKUPS_VERIFIED",
            "2026-09-17T14:33:00.000Z"
          ),
          "TEMPS_VERIFIED",
          "2026-09-17T14:34:00.000Z"
        ),
        "APPLYING",
        "2026-09-17T14:35:00.000Z",
        next => {
          next.operations[0].applied =
            true;
        }
      );

    const after =
      advanceJournal(
        before,
        "APPLYING",
        "2026-09-17T14:35:01.000Z",
        next => {
          next.operations[0].applied =
            false;
        }
      );

    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      let journal =
        journalFor();

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal
      });

      for (
        const next of [
          advanceJournal(
            journal,
            "REPLAY_CONSUMED",
            "2026-09-17T14:32:00.000Z"
          )
        ]
      ) {
        adapter.writeOrAdvanceTransactionJournalAtomically({
          journal:
            next
        });
        journal =
          next;
      }

      journal =
        advanceJournal(
          journal,
          "BACKUPS_VERIFIED",
          "2026-09-17T14:33:00.000Z"
        );
      adapter.writeOrAdvanceTransactionJournalAtomically({ journal });

      journal =
        advanceJournal(
          journal,
          "TEMPS_VERIFIED",
          "2026-09-17T14:34:00.000Z"
        );
      adapter.writeOrAdvanceTransactionJournalAtomically({ journal });

      journal =
        advanceJournal(
          journal,
          "APPLYING",
          "2026-09-17T14:35:00.000Z",
          next => {
            next.operations[0].applied =
              true;
          }
        );
      adapter.writeOrAdvanceTransactionJournalAtomically({ journal });

      assert.throws(
        () =>
          adapter.writeOrAdvanceTransactionJournalAtomically({
            journal:
              after
          }),
        /applied_regression/u
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "terminal journal states cannot advance",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      let journal =
        journalFor();

      adapter.writeOrAdvanceTransactionJournalAtomically({ journal });

      for (
        const [state, timestamp] of
          [
            ["REPLAY_CONSUMED", "2026-09-17T14:32:00.000Z"],
            ["BACKUPS_VERIFIED", "2026-09-17T14:33:00.000Z"],
            ["TEMPS_VERIFIED", "2026-09-17T14:34:00.000Z"],
            ["APPLYING", "2026-09-17T14:35:00.000Z"],
            ["POSTIMAGES_VERIFIED", "2026-09-17T14:36:00.000Z"],
            ["COMMITTED", "2026-09-17T14:37:00.000Z"]
          ]
      ) {
        journal =
          advanceJournal(
            journal,
            state,
            timestamp
          );

        adapter.writeOrAdvanceTransactionJournalAtomically({
          journal
        });
      }

      const attempt =
        advanceJournal(
          journal,
          "ROLLING_BACK",
          "2026-09-17T14:38:00.000Z"
        );

      assert.throws(
        () =>
          adapter.writeOrAdvanceTransactionJournalAtomically({
            journal:
              attempt
          }),
        /transition_invalid/u
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "replay key is durably consumed exactly once and is never released",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const transactionId =
        "artxn_v1_" + "5".repeat(32);

      const consumed =
        adapter.consumeOnceAtomically({
          replayKey:
            SHA_F,
          authorizationId:
            "arauth_v2_" + "1".repeat(32),
          authorizationFingerprint:
            SHA_A,
          transactionId,
          consumedAt:
            "2026-09-17T14:32:00.000Z"
        });

      assert.equal(
        consumed.consumed,
        true
      );

      assert.throws(
        () =>
          adapter.consumeOnceAtomically({
            replayKey:
              SHA_F,
            authorizationId:
              "arauth_v2_" + "1".repeat(32),
            authorizationFingerprint:
              SHA_A,
            transactionId,
            consumedAt:
              "2026-09-17T14:32:01.000Z"
          }),
        /replay_already_consumed/u
      );

      assert.equal(
        typeof adapter.releaseReplayKey,
        "undefined"
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "terminal execution audit is fingerprinted and written immutably",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      let journal =
        journalFor();

      for (
        const [state, timestamp] of
          [
            ["REPLAY_CONSUMED", "2026-09-17T14:32:00.000Z"],
            ["BACKUPS_VERIFIED", "2026-09-17T14:33:00.000Z"],
            ["TEMPS_VERIFIED", "2026-09-17T14:34:00.000Z"],
            ["APPLYING", "2026-09-17T14:35:00.000Z"],
            ["POSTIMAGES_VERIFIED", "2026-09-17T14:36:00.000Z"],
            ["COMMITTED", "2026-09-17T14:37:00.000Z"]
          ]
      ) {
        journal =
          advanceJournal(
            journal,
            state,
            timestamp
          );
      }

      const audit =
        buildAutonomousRepairExecutionTerminalAudit({
          journal,
          completedAt:
            "2026-09-17T14:37:01.000Z"
        });

      assert.equal(
        validateAutonomousRepairExecutionAuditArtifact(
          audit
        ),
        true
      );

      adapter.writeExecutionAuditAtomically({
        audit
      });

      assert.throws(
        () =>
          adapter.writeExecutionAuditAtomically({
            audit
          }),
        /EEXIST/u
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "RECOVERY_REQUIRED is a valid terminal audit state while forward resume remains outside the adapter",
  () => {
    let journal =
      journalFor();

    journal =
      advanceJournal(
        journal,
        "REPLAY_CONSUMED",
        "2026-09-17T14:32:00.000Z"
      );

    journal =
      advanceJournal(
        journal,
        "RECOVERY_REQUIRED",
        "2026-09-17T14:33:00.000Z"
      );

    const audit =
      buildAutonomousRepairExecutionTerminalAudit({
        journal,
        completedAt:
          "2026-09-17T14:33:01.000Z"
      });

    assert.equal(
      audit.terminalState,
      "RECOVERY_REQUIRED"
    );

    assert.equal(
      validateAutonomousRepairExecutionAuditArtifact(
        audit
      ),
      true
    );
  }
);

test(
  "nonterminal journal cannot produce a terminal audit",
  () => {
    assert.throws(
      () =>
        buildAutonomousRepairExecutionTerminalAudit({
          journal:
            journalFor(),
          completedAt:
            "2026-09-17T14:31:01.000Z"
        }),
      /terminal_audit_input_invalid/u
    );
  }
);

test(
  "external-state writes never mutate the project tree",
  () => {
    const ws =
      workspace();

    try {
      const before =
        fs.readFileSync(
          path.join(
            ws.projectRoot,
            "sentinel.txt"
          ),
          "utf8"
        );

      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const journal =
        journalFor();

      adapter.acquireGlobalExecutionLockAtomically({
        transactionId:
          journal.transactionId,
        authorizationId:
          journal.authorizationId,
        transactionFingerprint:
          journal.transactionFingerprint,
        acquiredAt:
          "2026-09-17T14:31:00.000Z"
      });

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal
      });

      adapter.consumeOnceAtomically({
        replayKey:
          journal.replayKey,
        authorizationId:
          journal.authorizationId,
        authorizationFingerprint:
          journal.authorizationFingerprint,
        transactionId:
          journal.transactionId,
        consumedAt:
          "2026-09-17T14:32:00.000Z"
      });

      adapter.releaseGlobalExecutionLock({
        transactionId:
          journal.transactionId
      });

      assert.equal(
        fs.readFileSync(
          path.join(
            ws.projectRoot,
            "sentinel.txt"
          ),
          "utf8"
        ),
        before
      );

      assert.deepEqual(
        fs.readdirSync(
          ws.projectRoot
        ),
        [
          "sentinel.txt"
        ]
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "transaction identifiers are executor-generated 128-bit random identities",
  () => {
    const first =
      newAutonomousRepairExecutionTransactionId();

    const second =
      newAutonomousRepairExecutionTransactionId();

    assert.match(
      first,
      /^artxn_v1_[0-9a-f]{32}$/u
    );

    assert.match(
      second,
      /^artxn_v1_[0-9a-f]{32}$/u
    );

    assert.notEqual(
      first,
      second
    );
  }
);

test(
  "external execution state module has no repair-target postimage or arbitrary caller output surface",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-external-execution-state.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of
        [
          "resolveAutonomousRepairExecutionTransactionPostimageBuffer",
          "materialContentBuffer",
          "publicationBundle",
          "replacementBytes",
          "targetContent",
          "child_process",
          "execSync(",
          "spawnSync("
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
  }
);


test(
  "global execution lock may be read back as a validated recovery ownership record",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const transactionId =
        "artxn_v1_" + "6".repeat(32);

      const acquired =
        adapter.acquireGlobalExecutionLockAtomically({
          transactionId,
          authorizationId:
            "arauth_v2_" + "1".repeat(32),
          transactionFingerprint:
            SHA_A,
          acquiredAt:
            "2026-09-17T14:40:00.000Z"
        });

      assert.deepEqual(
        adapter.readGlobalExecutionLock(),
        acquired.record
      );

      adapter.releaseGlobalExecutionLock({
        transactionId
      });

      assert.equal(
        adapter.readGlobalExecutionLock(),
        null
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "replay consumption may be read back for crash-recovery classification",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const journal =
        journalFor({
          transactionId:
            "artxn_v1_" + "7".repeat(32)
        });

      const consumed =
        adapter.consumeOnceAtomically({
          replayKey:
            journal.replayKey,
          authorizationId:
            journal.authorizationId,
          authorizationFingerprint:
            journal.authorizationFingerprint,
          transactionId:
            journal.transactionId,
          consumedAt:
            "2026-09-17T14:41:00.000Z"
        });

      assert.deepEqual(
        adapter.readReplayConsumption({
          replayKey:
            journal.replayKey
        }),
        consumed.record
      );

      assert.equal(
        adapter.readReplayConsumption({
          replayKey:
            SHA_A
        }),
        null
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "PREPARED transaction may terminate as ABORTED_PRE_CONSUME without replay release",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const prepared =
        journalFor({
          transactionId:
            "artxn_v1_" + "8".repeat(32)
        });

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          prepared
      });

      const aborted =
        advanceJournal(
          prepared,
          AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME,
          "2026-09-17T14:42:00.000Z"
        );

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          aborted
      });

      assert.equal(
        adapter.readReplayConsumption({
          replayKey:
            aborted.replayKey
        }),
        null
      );

      const audit =
        buildAutonomousRepairExecutionTerminalAudit({
          journal:
            aborted,
          completedAt:
            "2026-09-17T14:43:00.000Z"
        });

      adapter.writeExecutionAuditAtomically({
        audit
      });

      assert.deepEqual(
        adapter.readExecutionAudit({
          transactionId:
            aborted.transactionId,
          terminalState:
            AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME
        }),
        audit
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "recovery inspection blocks new forward execution for an unfinished journal even without a lock",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const prepared =
        journalFor({
          transactionId:
            "artxn_v1_" + "9".repeat(32)
        });

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          prepared
      });

      const inspection =
        adapter.inspectRecoveryObligations();

      assert.equal(
        inspection.ready,
        false
      );

      assert.equal(
        inspection.blockingLock,
        null
      );

      assert.deepEqual(
        inspection.unfinishedTransactionIds,
        [
          prepared.transactionId
        ]
      );

      assert.deepEqual(
        inspection.terminalAuditMissing,
        []
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "terminal journal remains a recovery obligation until its immutable audit exists",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const prepared =
        journalFor({
          transactionId:
            "artxn_v1_" + "a".repeat(32)
        });

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          prepared
      });

      const aborted =
        advanceJournal(
          prepared,
          AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME,
          "2026-09-17T14:44:00.000Z"
        );

      adapter.writeOrAdvanceTransactionJournalAtomically({
        journal:
          aborted
      });

      const missing =
        adapter.inspectRecoveryObligations();

      assert.equal(
        missing.ready,
        false
      );

      assert.deepEqual(
        missing.unfinishedTransactionIds,
        []
      );

      assert.deepEqual(
        missing.terminalAuditMissing,
        [
          {
            transactionId:
              aborted.transactionId,
            terminalState:
              AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME
          }
        ]
      );

      const audit =
        buildAutonomousRepairExecutionTerminalAudit({
          journal:
            aborted,
          completedAt:
            "2026-09-17T14:45:00.000Z"
        });

      adapter.writeExecutionAuditAtomically({
        audit
      });

      assert.deepEqual(
        adapter.inspectRecoveryObligations(),
        {
          ready:
            true,
          blockingLock:
            null,
          unfinishedTransactionIds:
            [],
          terminalAuditMissing:
            []
        }
      );
    } finally {
      ws.cleanup();
    }
  }
);

test(
  "recovery inspection treats a global lock as blocking unless the exact owner is explicitly ignored",
  () => {
    const ws =
      workspace();

    try {
      const adapter =
        createAutonomousRepairExternalExecutionStateAdapter({
          externalStateRoot:
            ws.externalStateRoot,
          projectRoot:
            ws.projectRoot
        });

      const transactionId =
        "artxn_v1_" + "b".repeat(32);

      adapter.acquireGlobalExecutionLockAtomically({
        transactionId,
        authorizationId:
          "arauth_v2_" + "1".repeat(32),
        transactionFingerprint:
          SHA_A,
        acquiredAt:
          "2026-09-17T14:46:00.000Z"
      });

      const blocked =
        adapter.inspectRecoveryObligations();

      assert.equal(
        blocked.ready,
        false
      );

      assert.equal(
        blocked.blockingLock.transactionId,
        transactionId
      );

      assert.deepEqual(
        adapter.inspectRecoveryObligations({
          ignoreLockTransactionId:
            transactionId
        }),
        {
          ready:
            true,
          blockingLock:
            null,
          unfinishedTransactionIds:
            [],
          terminalAuditMissing:
            []
        }
      );

      assert.throws(
        () =>
          adapter.inspectRecoveryObligations({
            ignoreLockTransactionId:
              "invalid"
          }),
        /ignore_lock_id_invalid/u
      );

      adapter.releaseGlobalExecutionLock({
        transactionId
      });
    } finally {
      ws.cleanup();
    }
  }
);
