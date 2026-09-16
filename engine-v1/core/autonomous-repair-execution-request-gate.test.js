import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createHash
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE,
  evaluateAutonomousRepairExecutionRequestGate,
  validateAutonomousRepairExecutionRequestGateArtifact
} from "./autonomous-repair-execution-request-gate.js";

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function evidenceCore({
  operationId,
  targetPath,
  mutationMode,
  targetExists,
  actualSha256,
  actualBytes,
  preconditionMatches
}) {
  return {
    operationId,
    targetPath,
    mutationMode,
    lexicalContained:
      true,
    physicalContained:
      true,
    reparseFree:
      true,
    parentChainVerified:
      true,
    targetExists,
    actualSha256,
    actualBytes,
    preconditionMatches
  };
}

function verificationOperation({
  operationId =
    "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa",
  targetPath =
    "data/history/request.json",
  mutationMode =
    "CREATE",
  blocked =
    false
} = {}) {
  const core =
    evidenceCore({
      operationId,
      targetPath,
      mutationMode,
      targetExists:
        blocked,
      actualSha256:
        blocked
          ? "2".repeat(64)
          : null,
      actualBytes:
        blocked
          ? 12
          : null,
      preconditionMatches:
        !blocked
    });

  return {
    ...core,

    preimageFingerprint:
      sha256Value(
        core
      ),

    verified:
      !blocked
  };
}

function makeVerification({
  mode =
    "NO_ACTION",
  generatedAt =
    "2026-09-16T08:00:00.000Z"
} = {}) {
  let operations =
    [];

  let blockers =
    [];

  let verificationState =
    "NO_ACTION_NO_OPERATIONS";

  if (
    mode ===
      "VERIFIED"
  ) {
    operations = [
      verificationOperation()
    ];

    verificationState =
      "TARGETS_VERIFIED";
  }

  if (
    mode ===
      "BLOCKED"
  ) {
    const operation =
      verificationOperation({
        blocked:
          true
      });

    operations = [
      operation
    ];

    blockers = [
      {
        code:
          "CREATE_TARGET_ALREADY_EXISTS",
        operationId:
          operation.operationId,
        targetPath:
          operation.targetPath
      }
    ];

    verificationState =
      "BLOCKED_TARGET_PREIMAGE";
  }

  const summary = {
    operationCount:
      operations.length,

    verifiedOperationCount:
      operations.filter(
        row =>
          row.verified
      ).length,

    blockedOperationCount:
      operations.filter(
        row =>
          !row.verified
      ).length,

    createCount:
      operations.filter(
        row =>
          row.mutationMode ===
            "CREATE"
      ).length,

    replaceCount:
      operations.filter(
        row =>
          row.mutationMode ===
            "REPLACE"
      ).length,

    blockerCount:
      blockers.length
  };

  const authority = {
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

    workflowMutationAuthorized:
      false
  };

  const artifact = {
    schema:
      "ai-matchlab.autonomous-repair-target-verification.v1",

    version:
      "1.0.0",

    dayKey:
      "2026-09-16",

    generatedAt,

    role:
      "derived_read_only_target_preimage_verification",

    planFingerprint:
      "1".repeat(64),

    verificationFingerprint:
      null,

    verificationState,
    summary,
    operations,
    blockers,
    authority
  };

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

test(
  "no-action target verification cannot request execution",
  () => {
    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          makeVerification()
      });

    assert.equal(
      result.requestState,
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.NO_ACTION
    );

    assert.equal(
      result.summary.operationCount,
      0
    );

    assert.equal(
      result.summary.requestableOperationCount,
      0
    );

    assert.equal(
      result.authority.authorizationRequestEligible,
      false
    );

    assert.equal(
      validateAutonomousRepairExecutionRequestGateArtifact(
        result
      ),
      true
    );
  }
);

test(
  "fully verified target scope becomes request-eligible but never execution-authorized",
  () => {
    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          makeVerification({
            mode:
              "VERIFIED"
          })
      });

    assert.equal(
      result.requestState,
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.REQUEST_ELIGIBLE
    );

    assert.equal(
      result.summary.operationCount,
      1
    );

    assert.equal(
      result.summary.requestableOperationCount,
      1
    );

    assert.equal(
      result.operationScope.length,
      1
    );

    assert.equal(
      result.authority.authorizationRequestEligible,
      true
    );

    for (
      const field of [
        "authorizationGranted",
        "filesystemWriteAuthorized",
        "repairAuthorized",
        "executionAuthorized",
        "rollbackExecutionAuthorized",
        "workflowMutationAuthorized"
      ]
    ) {
      assert.equal(
        result.authority[field],
        false,
        field
      );
    }
  }
);

test(
  "blocked target verification remains blocked and preserves exact blocker scope",
  () => {
    const source =
      makeVerification({
        mode:
          "BLOCKED"
      });

    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          source
      });

    assert.equal(
      result.requestState,
      AUTONOMOUS_REPAIR_EXECUTION_REQUEST_GATE_STATE.BLOCKED
    );

    assert.equal(
      result.summary.blockedOperationCount,
      1
    );

    assert.equal(
      result.summary.requestableOperationCount,
      0
    );

    assert.deepEqual(
      result.blockers,
      source.blockers
    );

    assert.equal(
      result.authority.authorizationRequestEligible,
      false
    );
  }
);

test(
  "request gate binds plan verification operation and preimage fingerprints",
  () => {
    const source =
      makeVerification({
        mode:
          "VERIFIED"
      });

    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          source
      });

    assert.equal(
      result.planFingerprint,
      source.planFingerprint
    );

    assert.equal(
      result.verificationFingerprint,
      source.verificationFingerprint
    );

    assert.equal(
      result.operationScope[0].operationId,
      source.operations[0].operationId
    );

    assert.equal(
      result.operationScope[0].preimageFingerprint,
      source.operations[0].preimageFingerprint
    );
  }
);

test(
  "tampered target verification is rejected before request eligibility",
  () => {
    const source =
      makeVerification({
        mode:
          "VERIFIED"
      });

    source.summary.operationCount =
      99;

    assert.throws(
      () =>
        evaluateAutonomousRepairExecutionRequestGate({
          targetVerification:
            source
        }),
      /target_verification_/
    );
  }
);

test(
  "request fingerprint ignores generatedAt-only churn",
  () => {
    const sourceA =
      makeVerification({
        mode:
          "VERIFIED",
        generatedAt:
          "2026-09-16T08:00:00.000Z"
      });

    const sourceB =
      makeVerification({
        mode:
          "VERIFIED",
        generatedAt:
          "2026-09-16T09:00:00.000Z"
      });

    assert.equal(
      sourceA.verificationFingerprint,
      sourceB.verificationFingerprint
    );

    const first =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          sourceA,
        generatedAt:
          "2026-09-16T10:00:00.000Z"
      });

    const second =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          sourceB,
        generatedAt:
          "2026-09-16T11:00:00.000Z"
      });

    assert.equal(
      first.requestFingerprint,
      second.requestFingerprint
    );
  }
);

test(
  "semantic validator rejects false request eligibility authority",
  () => {
    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          makeVerification({
            mode:
              "VERIFIED"
          })
      });

    result.authority
      .authorizationRequestEligible =
        false;

    result.requestFingerprint =
      sha256Value({
        schema:
          result.schema,
        version:
          result.version,
        dayKey:
          result.dayKey,
        planFingerprint:
          result.planFingerprint,
        verificationFingerprint:
          result.verificationFingerprint,
        requestState:
          result.requestState,
        summary:
          result.summary,
        operationScope:
          result.operationScope,
        blockers:
          result.blockers,
        authority:
          result.authority
      });

    assert.throws(
      () =>
        validateAutonomousRepairExecutionRequestGateArtifact(
          result
        ),
      /authority_invalid/
    );
  }
);

test(
  "semantic validator rejects false summary even with recomputed outer fingerprint",
  () => {
    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          makeVerification({
            mode:
              "VERIFIED"
          })
      });

    result.summary.requestableOperationCount =
      0;

    result.requestFingerprint =
      sha256Value({
        schema:
          result.schema,
        version:
          result.version,
        dayKey:
          result.dayKey,
        planFingerprint:
          result.planFingerprint,
        verificationFingerprint:
          result.verificationFingerprint,
        requestState:
          result.requestState,
        summary:
          result.summary,
        operationScope:
          result.operationScope,
        blockers:
          result.blockers,
        authority:
          result.authority
      });

    assert.throws(
      () =>
        validateAutonomousRepairExecutionRequestGateArtifact(
          result
        ),
      /summary_invalid/
    );
  }
);

test(
  "semantic validator rejects noncanonical operation scope ordering",
  () => {
    const source =
      makeVerification({
        mode:
          "VERIFIED"
      });

    const second =
      verificationOperation({
        operationId:
          "arpo_v1_bbbbbbbbbbbbbbbbbbbbbbbb",
        targetPath:
          "data/history/zzz.json"
      });

    source.operations.push(
      second
    );

    source.summary = {
      operationCount:
        2,
      verifiedOperationCount:
        2,
      blockedOperationCount:
        0,
      createCount:
        2,
      replaceCount:
        0,
      blockerCount:
        0
    };

    source.verificationFingerprint =
      sha256Value({
        schema:
          source.schema,
        version:
          source.version,
        dayKey:
          source.dayKey,
        planFingerprint:
          source.planFingerprint,
        verificationState:
          source.verificationState,
        summary:
          source.summary,
        operations:
          source.operations,
        blockers:
          source.blockers,
        authority:
          source.authority
      });

    // The source verifier itself requires canonical ordering, so first
    // create a canonical valid artifact by sorting.
    source.operations.sort(
      (a, b) =>
        [
          a.targetPath,
          a.operationId
        ]
          .join("\u0000")
          .localeCompare(
            [
              b.targetPath,
              b.operationId
            ].join("\u0000")
          )
    );

    source.verificationFingerprint =
      sha256Value({
        schema:
          source.schema,
        version:
          source.version,
        dayKey:
          source.dayKey,
        planFingerprint:
          source.planFingerprint,
        verificationState:
          source.verificationState,
        summary:
          source.summary,
        operations:
          source.operations,
        blockers:
          source.blockers,
        authority:
          source.authority
      });

    const result =
      evaluateAutonomousRepairExecutionRequestGate({
        targetVerification:
          source
      });

    result.operationScope.reverse();

    result.requestFingerprint =
      sha256Value({
        schema:
          result.schema,
        version:
          result.version,
        dayKey:
          result.dayKey,
        planFingerprint:
          result.planFingerprint,
        verificationFingerprint:
          result.verificationFingerprint,
        requestState:
          result.requestState,
        summary:
          result.summary,
        operationScope:
          result.operationScope,
        blockers:
          result.blockers,
        authority:
          result.authority
      });

    assert.throws(
      () =>
        validateAutonomousRepairExecutionRequestGateArtifact(
          result
        ),
      /operation_order_invalid/
    );
  }
);

test(
  "core request gate contains no filesystem mutation surface",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-execution-request-gate.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.equal(
      source.includes(
        'from "node:fs"'
      ),
      false
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
        "createWriteStream(",
        "fsyncSync("
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
