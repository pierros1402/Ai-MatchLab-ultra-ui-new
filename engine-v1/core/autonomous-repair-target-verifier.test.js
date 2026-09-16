import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE,
  validateAutonomousRepairTargetVerificationArtifact,
  verifyAutonomousRepairPlanTargets
} from "./autonomous-repair-target-verifier.js";

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(value[key])
          ]
        )
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest("hex");
}

function sha256Buffer(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function operationId(operation) {
  const identity = {
    candidateDecisionId:
      operation.candidateDecisionId,
    repairClass:
      operation.repairClass,
    canonicalId:
      operation.canonicalId,
    targetPath:
      operation.targetPath,
    mutationMode:
      operation.mutationMode,
    precondition:
      operation.precondition,
    planned:
      operation.planned,
    rollback:
      operation.rollback
  };

  return `arpo_v1_${sha256Value(identity).slice(0, 24)}`;
}

function makeOperation({
  targetPath,
  mutationMode,
  expectedSha256 = null,
  repairClass =
    "REBUILD_HISTORY_ELIGIBLE_ROW",
  canonicalId =
    "cid_test_home_away_20260916"
}) {
  const base = {
    candidateDecisionId:
      "arpd_v1_111111111111111111111111",

    repairClass,
    canonicalId,
    targetPath,
    mutationMode,

    precondition: {
      targetExists:
        mutationMode === "REPLACE",

      expectedSha256:
        mutationMode === "REPLACE"
          ? expectedSha256
          : null
    },

    planned: {
      contentSha256:
        "b".repeat(64),
      contentBytes:
        123
    },

    rollback:
      mutationMode === "REPLACE"
        ? {
            strategy:
              "RESTORE_PREIMAGE",
            preimageRequired:
              true,
            preimageSha256:
              expectedSha256
          }
        : {
            strategy:
              "DELETE_CREATED_TARGET",
            preimageRequired:
              false,
            preimageSha256:
              null
          }
  };

  return {
    operationId:
      operationId(base),
    ...base
  };
}

function makePlan({
  operations = [],
  planState =
    operations.length
      ? "DRY_RUN_READY"
      : "NO_ACTION_NOT_REQUESTABLE"
} = {}) {
  const plan = {
    schema:
      "ai-matchlab.autonomous-repair-plan.v1",

    version:
      "1.0.0",

    dayKey:
      "2026-09-16",

    generatedAt:
      "2026-09-16T04:00:00.000Z",

    role:
      "derived_dry_run_repair_plan",

    bindings: {
      truthFingerprint:
        "1".repeat(64),
      auditFingerprint:
        "2".repeat(64),
      downstreamEvidenceFingerprint:
        "3".repeat(64),
      primaryEvidenceFingerprint:
        "4".repeat(64),
      policyFingerprint:
        "5".repeat(64),
      verificationFingerprint:
        "6".repeat(64),
      gateFingerprint:
        "7".repeat(64)
    },

    planFingerprint:
      null,

    planState,

    summary: {
      candidateCount:
        operations.length,
      operationCount:
        operations.length,
      createCount:
        operations.filter(
          row =>
            row.mutationMode === "CREATE"
        ).length,
      replaceCount:
        operations.filter(
          row =>
            row.mutationMode === "REPLACE"
        ).length,
      blockerCount:
        0
    },

    candidateDecisionIds:
      [
        ...new Set(
          operations.map(
            row =>
              row.candidateDecisionId
          )
        )
      ].sort(),

    operations,
    blockers: [],

    authority: {
      dryRunOnly:
        true,
      filesystemWriteAuthorized:
        false,
      repairAuthorized:
        false,
      executionAuthorized:
        false,
      rollbackExecutionAuthorized:
        false,
      workflowMutationAuthorized:
        false
    }
  };

  const fingerprintInput = {
    schema:
      plan.schema,
    version:
      plan.version,
    dayKey:
      plan.dayKey,
    bindings:
      plan.bindings,
    planState:
      plan.planState,
    summary:
      plan.summary,
    candidateDecisionIds:
      plan.candidateDecisionIds,
    operations:
      plan.operations,
    blockers:
      plan.blockers,
    authority:
      plan.authority
  };

  plan.planFingerprint =
    sha256Value(
      fingerprintInput
    );

  return plan;
}

function refingerprintPlan(
  plan
) {
  plan.planFingerprint =
    sha256Value({
      schema:
        plan.schema,
      version:
        plan.version,
      dayKey:
        plan.dayKey,
      bindings:
        plan.bindings,
      planState:
        plan.planState,
      summary:
        plan.summary,
      candidateDecisionIds:
        plan.candidateDecisionIds,
      operations:
        plan.operations,
      blockers:
        plan.blockers,
      authority:
        plan.authority
    });

  return plan;
}

function refingerprintVerificationArtifact(
  artifact
) {
  artifact.verificationFingerprint =
    sha256Value({
      schema:
        artifact.schema,
      version:
        artifact.version,
      dayKey:
        artifact.dayKey,
      planFingerprint:
        artifact.planFingerprint,
      verificationState:
        artifact.verificationState,
      summary:
        artifact.summary,
      operations:
        artifact.operations,
      blockers:
        artifact.blockers,
      authority:
        artifact.authority
    });

  return artifact;
}

function tempRoot() {
  return fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "aiml-roadmap7b-"
    )
  );
}

function cleanup(root) {
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

test(
  "no-operation dry-run plan produces read-only NO_ACTION verification",
  () => {
    const root =
      tempRoot();

    try {
      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan(),
          projectRoot:
            root,
          generatedAt:
            "2026-09-16T05:00:00.000Z"
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION
      );

      assert.equal(
        result.summary.operationCount,
        0
      );

      assert.equal(
        result.summary.blockerCount,
        0
      );

      assert.equal(
        result.authority.readOnly,
        true
      );

      assert.equal(
        result.authority.filesystemWriteAuthorized,
        false
      );

      assert.equal(
        validateAutonomousRepairTargetVerificationArtifact(
          result
        ),
        true
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "CREATE proves exact target absence with safe existing parent chain",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/new-row.json",
          mutationMode:
            "CREATE"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED
      );

      assert.equal(
        result.operations[0].targetExists,
        false
      );

      assert.equal(
        result.operations[0].parentChainVerified,
        true
      );

      assert.equal(
        result.operations[0].preconditionMatches,
        true
      );

      assert.equal(
        result.operations[0].verified,
        true
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "CREATE blocks when target already exists",
  () => {
    const root =
      tempRoot();

    try {
      const target =
        path.join(
          root,
          "data",
          "history",
          "existing.json"
        );

      fs.mkdirSync(
        path.dirname(target),
        {
          recursive:
            true
        }
      );

      fs.writeFileSync(
        target,
        "existing"
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/existing.json",
          mutationMode:
            "CREATE"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "CREATE_TARGET_ALREADY_EXISTS"
        )
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "REPLACE reads raw bytes and verifies exact SHA-256 preimage",
  () => {
    const root =
      tempRoot();

    try {
      const target =
        path.join(
          root,
          "data",
          "history",
          "existing.json"
        );

      fs.mkdirSync(
        path.dirname(target),
        {
          recursive:
            true
        }
      );

      const content =
        Buffer.from(
          "{\"ok\":true}\n",
          "utf8"
        );

      fs.writeFileSync(
        target,
        content
      );

      const expected =
        sha256Buffer(
          content
        );

      const operation =
        makeOperation({
          targetPath:
            "data/history/existing.json",
          mutationMode:
            "REPLACE",
          expectedSha256:
            expected
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED
      );

      assert.equal(
        result.operations[0].actualSha256,
        expected
      );

      assert.equal(
        result.operations[0].actualBytes,
        content.length
      );

      assert.equal(
        result.operations[0].preconditionMatches,
        true
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "REPLACE blocks changed preimage hash",
  () => {
    const root =
      tempRoot();

    try {
      const target =
        path.join(
          root,
          "data",
          "history",
          "changed.json"
        );

      fs.mkdirSync(
        path.dirname(target),
        {
          recursive:
            true
        }
      );

      fs.writeFileSync(
        target,
        "actual-content"
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/changed.json",
          mutationMode:
            "REPLACE",
          expectedSha256:
            "a".repeat(64)
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "TARGET_PREIMAGE_SHA256_MISMATCH"
        )
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "lexical traversal is blocked before filesystem access",
  () => {
    const root =
      tempRoot();

    try {
      const operation =
        makeOperation({
          targetPath:
            "data/history/../escape.json",
          mutationMode:
            "CREATE"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "TARGET_PATH_INVALID"
        )
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "symlink or junction in target path chain fails closed",
  () => {
    const root =
      tempRoot();

    const outside =
      tempRoot();

    try {
      const data =
        path.join(
          root,
          "data"
        );

      fs.mkdirSync(
        data,
        {
          recursive:
            true
        }
      );

      const link =
        path.join(
          data,
          "history"
        );

      fs.symlinkSync(
        outside,
        link,
        process.platform === "win32"
          ? "junction"
          : "dir"
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/escape.json",
          mutationMode:
            "CREATE"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "TARGET_PATH_REPARSE_POINT" ||
            row.code ===
            "TARGET_PATH_PHYSICAL_ROOT_ESCAPE"
        )
      );
    } finally {
      cleanup(root);
      cleanup(outside);
    }
  }
);

test(
  "protected frozen Value target remains blocked",
  () => {
    const root =
      tempRoot();

    try {
      const operation =
        makeOperation({
          targetPath:
            "data/deploy-snapshots/2026-09-16/value.json",
          mutationMode:
            "CREATE",
          repairClass:
            "REBUILD_PUBLICATION_CANONICAL_ROW"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "PROTECTED_TARGET_PATH"
        )
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "tampered plan fingerprint is rejected before target verification",
  () => {
    const root =
      tempRoot();

    try {
      const plan =
        makePlan();

      plan.planFingerprint =
        "f".repeat(64);

      assert.throws(
        () =>
          verifyAutonomousRepairPlanTargets({
            plan,
            projectRoot:
              root
          }),
        /plan_fingerprint_mismatch/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "tampered operationId is rejected even when plan fingerprint is recomputed",
  () => {
    const root =
      tempRoot();

    try {
      const operation =
        makeOperation({
          targetPath:
            "data/history/new.json",
          mutationMode:
            "CREATE"
        });

      operation.operationId =
        "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa";

      const plan =
        makePlan({
          operations:
            [operation]
        });

      assert.throws(
        () =>
          verifyAutonomousRepairPlanTargets({
            plan,
            projectRoot:
              root
          }),
        /operation_id_mismatch/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "verification fingerprint ignores generatedAt-only churn",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/new.json",
          mutationMode:
            "CREATE"
        });

      const plan =
        makePlan({
          operations:
            [operation]
        });

      const first =
        verifyAutonomousRepairPlanTargets({
          plan,
          projectRoot:
            root,
          generatedAt:
            "2026-09-16T05:00:00.000Z"
        });

      const second =
        verifyAutonomousRepairPlanTargets({
          plan,
          projectRoot:
            root,
          generatedAt:
            "2026-09-16T05:01:00.000Z"
        });

      assert.equal(
        first.verificationFingerprint,
        second.verificationFingerprint
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "CREATE fails closed when an intermediate parent directory is missing",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/missing-parent/new.json",
          mutationMode:
            "CREATE"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.equal(
        result.operations[0].parentChainVerified,
        false
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "TARGET_PARENT_MISSING"
        )
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "duplicate normalized target paths are rejected independently",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const first =
        makeOperation({
          targetPath:
            "data/history/duplicate.json",
          mutationMode:
            "CREATE",
          canonicalId:
            "cid_duplicate_one_20260916"
        });

      const second =
        makeOperation({
          targetPath:
            "data/history/duplicate.json",
          mutationMode:
            "CREATE",
          canonicalId:
            "cid_duplicate_two_20260916"
        });

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [
                  first,
                  second
                ]
            }),
          projectRoot:
            root
        });

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.equal(
        result.summary.verifiedOperationCount,
        0
      );

      assert.equal(
        result.blockers.filter(
          row =>
            row.code ===
            "DUPLICATE_TARGET_PATH"
        ).length,
        2
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "plan authority fields must be explicitly false",
  () => {
    const root =
      tempRoot();

    try {
      const plan =
        makePlan();

      delete plan.authority
        .executionAuthorized;

      refingerprintPlan(
        plan
      );

      assert.throws(
        () =>
          verifyAutonomousRepairPlanTargets({
            plan,
            projectRoot:
              root
          }),
        /plan_executionAuthorized_invalid/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "plan state must agree with operation cardinality",
  () => {
    const root =
      tempRoot();

    try {
      const operation =
        makeOperation({
          targetPath:
            "data/history/state.json",
          mutationMode:
            "CREATE"
        });

      const nonEmptyNoAction =
        makePlan({
          operations:
            [operation],
          planState:
            "NO_ACTION_NOT_REQUESTABLE"
        });

      assert.throws(
        () =>
          verifyAutonomousRepairPlanTargets({
            plan:
              nonEmptyNoAction,
            projectRoot:
              root
          }),
        /plan_state_operation_coherence/
      );

      const emptyDryRun =
        makePlan({
          operations:
            [],
          planState:
            "DRY_RUN_READY"
        });

      assert.throws(
        () =>
          verifyAutonomousRepairPlanTargets({
            plan:
              emptyDryRun,
            projectRoot:
              root
          }),
        /plan_state_operation_coherence/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "REPLACE descriptor verification fails closed on fstat identity drift",
  () => {
    const root =
      tempRoot();

    const originalFstatSync =
      fs.fstatSync;

    try {
      const target =
        path.join(
          root,
          "data",
          "history",
          "descriptor-race.json"
        );

      fs.mkdirSync(
        path.dirname(
          target
        ),
        {
          recursive:
            true
        }
      );

      const content =
        Buffer.from(
          "{\"stable\":true}\n",
          "utf8"
        );

      fs.writeFileSync(
        target,
        content
      );

      const operation =
        makeOperation({
          targetPath:
            "data/history/descriptor-race.json",
          mutationMode:
            "REPLACE",
          expectedSha256:
            sha256Buffer(
              content
            )
        });

      let fstatCalls =
        0;

      fs.fstatSync =
        function patchedFstatSync(
          fd,
          options
        ) {
          const stat =
            originalFstatSync.call(
              fs,
              fd,
              options
            );

          fstatCalls +=
            1;

          if (
            fstatCalls ===
              2 &&
            typeof stat.mtimeNs ===
              "bigint"
          ) {
            stat.mtimeNs +=
              1n;
          }

          return stat;
        };

      const result =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations:
                [operation]
            }),
          projectRoot:
            root
        });

      assert.ok(
        fstatCalls >=
          2
      );

      assert.equal(
        result.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      );

      assert.ok(
        result.blockers.some(
          row =>
            row.code ===
            "TARGET_CHANGED_DURING_VERIFICATION"
        )
      );

      const source =
        fs.readFileSync(
          new URL(
            "./autonomous-repair-target-verifier.js",
            import.meta.url
          ),
          "utf8"
        );

      for (
        const required of [
          "fs.openSync(",
          "fs.fstatSync(",
          "fs.closeSync(",
          "beforeFd",
          "afterFd",
          "physicalBefore",
          "physicalAfter"
        ]
      ) {
        assert.ok(
          source.includes(
            required
          ),
          "missing_descriptor_boundary:" +
            required
        );
      }
    } finally {
      fs.fstatSync =
        originalFstatSync;

      cleanup(root);
    }
  }
);

test(
  "semantic validator accepts generated VERIFIED and BLOCKED artifacts",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const verified =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations: [
                makeOperation({
                  targetPath:
                    "data/history/semantic-valid.json",
                  mutationMode:
                    "CREATE"
                })
              ]
            }),
          projectRoot:
            root
        });

      const blocked =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations: [
                makeOperation({
                  targetPath:
                    "data/history/missing-parent/semantic-blocked.json",
                  mutationMode:
                    "CREATE"
                })
              ]
            }),
          projectRoot:
            root
        });

      assert.equal(
        validateAutonomousRepairTargetVerificationArtifact(
          verified
        ),
        true
      );

      assert.equal(
        validateAutonomousRepairTargetVerificationArtifact(
          blocked
        ),
        true
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects an invalid verification artifact role",
  () => {
    const root =
      tempRoot();

    try {
      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan(),
          projectRoot:
            root
        });

      artifact.role =
        "unexpected_role";

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /role_invalid/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects recomputed fingerprint with false summary",
  () => {
    const root =
      tempRoot();

    try {
      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan(),
          projectRoot:
            root
        });

      artifact.summary.operationCount =
        1;

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /summary_invalid/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects recomputed fingerprint with false state",
  () => {
    const root =
      tempRoot();

    try {
      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan(),
          projectRoot:
            root
        });

      artifact.verificationState =
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED;

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /state_mismatch/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects recomputed outer fingerprint with false operation preimage fingerprint",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations: [
                makeOperation({
                  targetPath:
                    "data/history/semantic-operation.json",
                  mutationMode:
                    "CREATE"
                })
              ]
            }),
          projectRoot:
            root
        });

      artifact.operations[0].preimageFingerprint =
        "0".repeat(64);

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /operation_fingerprint_mismatch/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects verified flag that disagrees with blockers",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations: [
                makeOperation({
                  targetPath:
                    "data/history/semantic-verified.json",
                  mutationMode:
                    "CREATE"
                })
              ]
            }),
          projectRoot:
            root
        });

      artifact.operations[0].verified =
        false;

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /operation_verified_mismatch/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects blocker bound to unknown operation",
  () => {
    const root =
      tempRoot();

    try {
      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan(),
          projectRoot:
            root
        });

      artifact.blockers.push({
        code:
          "SYNTHETIC_UNKNOWN_OPERATION",
        operationId:
          "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa",
        targetPath:
          "data/history/unknown.json"
      });

      artifact.summary.blockerCount =
        1;

      artifact.verificationState =
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED;

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /blocker_unbound/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "semantic validator rejects noncanonical operation ordering",
  () => {
    const root =
      tempRoot();

    try {
      fs.mkdirSync(
        path.join(
          root,
          "data",
          "history"
        ),
        {
          recursive:
            true
        }
      );

      const artifact =
        verifyAutonomousRepairPlanTargets({
          plan:
            makePlan({
              operations: [
                makeOperation({
                  targetPath:
                    "data/history/semantic-a.json",
                  mutationMode:
                    "CREATE",
                  canonicalId:
                    "cid_semantic_a_20260916"
                }),
                makeOperation({
                  targetPath:
                    "data/history/semantic-b.json",
                  mutationMode:
                    "CREATE",
                  canonicalId:
                    "cid_semantic_b_20260916"
                })
              ]
            }),
          projectRoot:
            root
        });

      artifact.operations.reverse();

      refingerprintVerificationArtifact(
        artifact
      );

      assert.throws(
        () =>
          validateAutonomousRepairTargetVerificationArtifact(
            artifact
          ),
        /operation_order_invalid/
      );
    } finally {
      cleanup(root);
    }
  }
);

test(
  "core verifier contains no filesystem mutation APIs",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-target-verifier.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "writeFileSync(",
        "writeFile(",
        "appendFileSync(",
        "appendFile(",
        "renameSync(",
        "rename(",
        "unlinkSync(",
        "unlink(",
        "rmSync(",
        "rm(",
        "mkdirSync(",
        "mkdir(",
        "copyFileSync(",
        "copyFile(",
        "createWriteStream("
      ]
    ) {
      assert.equal(
        source.includes(
          `fs.${forbidden}`
        ),
        false,
        `forbidden mutation API found: fs.${forbidden}`
      );
    }
  }
);
