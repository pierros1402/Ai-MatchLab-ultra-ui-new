import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "../core/checkpoint-aware-targeted-repair-controller.js";

import {
  buildCheckpointAwareTargetedRepairExecutorContract
} from "../core/checkpoint-aware-targeted-repair-executor-contract.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE,
  buildCheckpointAwareValueComparisonMutationPreflight,
  checkpointAwareValueComparisonMutationPreflightFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-mutation-preflight.js";

const DAY =
  "2026-09-23";

const HEAD =
  "d890ffe3b4e4eff21d85609fd0aa76e69c1fb3f7";

const AT =
  "2026-09-23T06:00:00.000Z";

const SHA_A =
  "a".repeat(64);

const SHA_B =
  "b".repeat(64);

const SHA_C =
  "c".repeat(64);

const SHA_D =
  "d".repeat(64);

function route() {
  const decision =
    buildCheckpointAwareTargetedRepairControllerDecision({
      dayKey:
        DAY,

      generatedAt:
        AT,

      expectedRemoteHead:
        HEAD,

      observedRemoteHead:
        HEAD,

      signals: [
        "value_plan_comparison_stale_against_canonical"
      ]
    });

  const executorContract =
    buildCheckpointAwareTargetedRepairExecutorContract({
      decision
    });

  return {
    decision,
    executorContract
  };
}

function readiness(
  overrides = {}
) {
  return {
    state:
      "BLOCKED_NO_PINNED_TRUST",

    trustedKeyCount:
      0,

    pinnedTrustRequired:
      true,

    productionKernelEnabled:
      false,

    ...overrides
  };
}

function target({
  path,
  before,
  after,
  changed,
  diffPaths = []
}) {
  return {
    targetPath:
      path,

    targetExists:
      true,

    preimageSha256:
      before,

    preimageBytes:
      100,

    candidateMaterialSha256:
      after,

    candidateMaterialBytes:
      120,

    semanticChange:
      changed,

    semanticDiffPaths:
      diffPaths
  };
}

function build({
  dayChanged = false,
  cumulativeChanged = false,
  readinessOverrides = {}
} = {}) {
  const {
    decision,
    executorContract
  } = route();

  return buildCheckpointAwareValueComparisonMutationPreflight({
    dayKey:
      DAY,

    remoteHead:
      HEAD,

    decision,

    executorContract,

    productionExecutionReadiness:
      readiness(
        readinessOverrides
      ),

    targets: [
      target({
        path:
          `data/value-comparison/${DAY}.json`,
        before:
          SHA_A,
        after:
          dayChanged
            ? SHA_B
            : SHA_B,
        changed:
          dayChanged,
        diffPaths:
          dayChanged
            ? [
                "$.plans.A.summary.picks"
              ]
            : []
      }),

      target({
        path:
          "data/value-comparison/cumulative.json",
        before:
          SHA_C,
        after:
          cumulativeChanged
            ? SHA_D
            : SHA_D,
        changed:
          cumulativeChanged,
        diffPaths:
          cumulativeChanged
            ? [
                "$.plans.A.summary.wins"
              ]
            : []
      })
    ]
  });
}

test(
  "healthy semantic equality produces a zero-operation mutation preflight",
  () => {
    const artifact =
      build();

    assert.equal(
      artifact
        .preflightState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE
        .NO_MUTATION_REQUIRED
    );

    assert.equal(
      artifact.operations.length,
      0
    );

    assert.equal(
      artifact
        .summary
        .proposedMutationCount,
      0
    );
  }
);

test(
  "one semantic change produces exactly one hash-bound replace candidate",
  () => {
    const artifact =
      build({
        dayChanged:
          true
      });

    assert.equal(
      artifact
        .preflightState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE
        .MUTATION_CANDIDATE_READY
    );

    assert.equal(
      artifact.operations.length,
      1
    );

    assert.equal(
      artifact
        .operations[0]
        .targetPath,
      `data/value-comparison/${DAY}.json`
    );

    assert.equal(
      artifact
        .operations[0]
        .mutationMode,
      "REPLACE"
    );
  }
);

test(
  "two semantic changes remain bounded to the exact two comparison targets",
  () => {
    const artifact =
      build({
        dayChanged:
          true,
        cumulativeChanged:
          true
      });

    assert.deepEqual(
      artifact
        .operations
        .map(
          row =>
            row.targetPath
        ),
      [
        `data/value-comparison/${DAY}.json`,
        "data/value-comparison/cumulative.json"
      ]
    );

    assert.equal(
      artifact
        .summary
        .proposedMutationCount,
      2
    );
  }
);

test(
  "unexpected target path fails closed",
  () => {
    const {
      decision,
      executorContract
    } = route();

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonMutationPreflight({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          decision,

          executorContract,

          productionExecutionReadiness:
            readiness(),

          targets: [
            target({
              path:
                `data/value-comparison/${DAY}.json`,
              before:
                SHA_A,
              after:
                SHA_B,
              changed:
                false
            }),

            target({
              path:
                "data/value-comparison/NOT-cumulative.json",
              before:
                SHA_C,
              after:
                SHA_D,
              changed:
                false
            })
          ]
        }),
      /target_path_invalid|target_invalid/u
    );
  }
);

test(
  "missing production preimage fails closed instead of widening to create mode",
  () => {
    const {
      decision,
      executorContract
    } = route();

    const first =
      target({
        path:
          `data/value-comparison/${DAY}.json`,
        before:
          SHA_A,
        after:
          SHA_B,
        changed:
          true
      });

    first.targetExists =
      false;

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonMutationPreflight({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          decision,

          executorContract,

          productionExecutionReadiness:
            readiness(),

          targets: [
            first,

            target({
              path:
                "data/value-comparison/cumulative.json",
              before:
                SHA_C,
              after:
                SHA_D,
              changed:
                false
            })
          ]
        }),
      /existing_preimage_required/u
    );
  }
);

test(
  "semantic change cannot claim byte-identical candidate material",
  () => {
    const {
      decision,
      executorContract
    } = route();

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonMutationPreflight({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          decision,

          executorContract,

          productionExecutionReadiness:
            readiness(),

          targets: [
            target({
              path:
                `data/value-comparison/${DAY}.json`,
              before:
                SHA_A,
              after:
                SHA_A,
              changed:
                true,
              diffPaths: [
                "$.plans.A.summary.picks"
              ]
            }),

            target({
              path:
                "data/value-comparison/cumulative.json",
              before:
                SHA_C,
              after:
                SHA_D,
              changed:
                false
            })
          ]
        }),
      /changed_semantics_require_distinct_material/u
    );
  }
);

test(
  "production kernel must remain disabled at mutation-preflight stage",
  () => {
    assert.throws(
      () =>
        build({
          readinessOverrides: {
            productionKernelEnabled:
              true
          }
        }),
      /production_kernel_must_remain_disabled/u
    );
  }
);

test(
  "preflight preserves legacy value-comparison protection and has no production execution machinery",
  () => {
    const artifact =
      build({
        dayChanged:
          true
      });

    assert.equal(
      artifact
        .legacyCompatibilityBoundary
        .genericAutonomousRepairPlanProtectedPath,
      true
    );

    assert.equal(
      artifact
        .legacyCompatibilityBoundary
        .genericAutonomousRepairTargetVerifierProtectedPath,
      true
    );

    assert.equal(
      artifact
        .legacyCompatibilityBoundary
        .protectedPathBypassAuthorized,
      false
    );

    assert.equal(
      artifact
        .productionExecutionBoundary
        .productionKernelInvocationAuthorized,
      false
    );

    assert.equal(
      artifact
        .authority
        .signerUseAuthorized,
      false
    );

    assert.equal(
      artifact
        .preflightFingerprint,
      checkpointAwareValueComparisonMutationPreflightFingerprint(
        artifact
      )
    );

    const planSource =
      fs.readFileSync(
        new URL(
          "../core/autonomous-repair-plan.js",
          import.meta.url
        ),
        "utf8"
      );

    const verifierSource =
      fs.readFileSync(
        new URL(
          "../core/autonomous-repair-target-verifier.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.equal(
      planSource.includes(
        'lower.includes("/value-comparison/")'
      ),
      true
    );

    assert.equal(
      verifierSource.includes(
        'lower.includes("/value-comparison/")'
      ),
      true
    );

    const runnerSource =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-mutation-preflight-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "executeAutonomousRepairProductionExecution",
        "executeAutonomousRepairFilesystemTransaction",
        "git push",
        "git commit",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        runnerSource.includes(
          forbidden
        ),
        false,
        `mutation preflight runner must not contain ${forbidden}`
      );
    }
  }
);
