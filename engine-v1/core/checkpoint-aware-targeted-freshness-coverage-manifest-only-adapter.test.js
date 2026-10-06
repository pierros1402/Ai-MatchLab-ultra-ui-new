import assert from "node:assert/strict";
import test from "node:test";

import {
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest
} from "./deploy-snapshot-release-contract.js";

import {
  CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_MUTATION_KEYS,
  buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate
} from "./checkpoint-aware-targeted-freshness-coverage-manifest-only-adapter.js";

import {
  buildCheckpointAwareTargetedRepairExecutorContract
} from "./checkpoint-aware-targeted-repair-executor-contract.js";

import {
  classifyCheckpointAwareFreshnessCoverageReadinessPlan
} from "./checkpoint-aware-targeted-freshness-coverage-readiness-plan.js";

const DAY =
  "2026-10-05";

function fixtureManifest() {
  const manifest = {
    ok: true,
    date: DAY,
    generatedAt:
      "2026-10-05T15:00:00.000Z",
    startedAt:
      "2026-10-05T14:59:00.000Z",
    source:
      "local_canonical_export",
    version:
      "deploy-snapshot-v2",
    fixturesSource:
      "canonical",
    staticMinTargetFixtures: 0,
    minTargetFixtures: 0,
    minTargetFixtureSource:
      "test",
    canonicalCoverageFixtureCount: 0,
    files: {
      fixtures:
        "fixtures.json",
      value:
        "value.json",
      valueAudit:
        "value-audit.json",
      planCShadow:
        null,
      planCShadowAudit:
        null,
      detailsDir:
        "details"
    },
    fileHashes: {
      "fixtures.json":
        "a".repeat(64),
      "value.json":
        "b".repeat(64),
      "value-audit.json":
        "c".repeat(64)
    },
    counts: {
      fixtures: 0,
      valuePicks: 0,
      details: 1,
      detailsMatchedToFixtures: 1,
      orphanDetailsRemoved: 0,
      detailsMissingForFixtures: 0
    },
    coverage: {
      detailsWithTravel: 0
    },
    sizes: {
      fixturesMb: 0,
      valueMb: 0,
      detailsTotalMb: 0
    },
    details: [
      {
        file:
          "cid_test.json",
        bytes: 2,
        hasTravel: false,
        hasPlayerUsage: false,
        hasTeamNews: false,
        hasValue: false,
        sha256:
          "d".repeat(64)
      }
    ]
  };

  manifest.hash =
    computeDeploySnapshotManifestHash(
      manifest
    );

  return manifest;
}

function fixtureCoverage() {
  return {
    ok: true,
    dayKey: DAY,
    generatedAt:
      "2026-10-05T15:00:01.000Z"
  };
}

function exactFreshness() {
  return {
    ok: false,
    manifestGeneratedAt:
      "2026-10-05T15:00:00.000Z",
    reasons: [
      "snapshot_stale_against_coverage_readiness"
    ],
    staleInputs: [
      {
        kind:
          "coverage_readiness",
        artifact:
          `coverage-readiness/${DAY}.json`,
        at:
          "2026-10-05T15:00:01.000Z",
        staleReason:
          "snapshot_stale_against_coverage_readiness",
        newerThanManifestMs:
          1000
      }
    ],
    staleDerivedArtifacts: [],
    missingRequiredArtifacts: [],
    fourPlanContract: {
      complete: true
    }
  };
}

test(
  "manifest-only adapter exposes exactly the authorized assignment keys",
  () => {
    assert.deepEqual(
      [
        ...CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_MUTATION_KEYS
      ],
      [
        "generatedAt",
        "hash"
      ]
    );
  }
);

test(
  "manifest-only adapter retimes a valid manifest without mutating its input",
  () => {
    const manifest =
      fixtureManifest();

    const before =
      structuredClone(
        manifest
      );

    const result =
      buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
        dayKey: DAY,
        manifest,
        coverageReadiness:
          fixtureCoverage(),
        generatedAt:
          "2026-10-05T15:00:02.000Z"
      });

    assert.equal(
      result.ok,
      true
    );

    assert.deepEqual(
      manifest,
      before
    );

    assert.equal(
      result.manifest.generatedAt,
      "2026-10-05T15:00:02.000Z"
    );

    assert.deepEqual(
      result.assignedMutationKeys,
      [
        "generatedAt",
        "hash"
      ]
    );

    assert.deepEqual(
      result.changedTopLevelKeys,
      [
        "generatedAt"
      ]
    );

    assert.equal(
      result.manifest.hash,
      manifest.hash
    );

    assert.equal(
      validateDeploySnapshotManifest(
        result.manifest,
        DAY
      ).ok,
      true
    );
  }
);

test(
  "manifest-only adapter preserves every non-authorized top-level key",
  () => {
    const before =
      fixtureManifest();

    const result =
      buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
        dayKey: DAY,
        manifest: before,
        coverageReadiness:
          fixtureCoverage(),
        generatedAt:
          "2026-10-05T15:00:02.000Z"
      });

    for (
      const key of
      Object.keys(before)
    ) {
      if (
        key === "generatedAt" ||
        key === "hash"
      ) {
        continue;
      }

      assert.deepEqual(
        result.manifest[key],
        before[key],
        `unexpected mutation at ${key}`
      );
    }
  }
);

test(
  "manifest-only adapter rejects a target timestamp older than coverage readiness",
  () => {
    assert.throws(
      () =>
        buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
          dayKey: DAY,
          manifest:
            fixtureManifest(),
          coverageReadiness:
            fixtureCoverage(),
          generatedAt:
            "2026-10-05T15:00:00.500Z"
        }),
      /target_before_coverage_readiness/u
    );
  }
);

test(
  "manifest-only adapter rejects day mismatch",
  () => {
    const coverage =
      fixtureCoverage();

    coverage.dayKey =
      "2026-10-04";

    assert.throws(
      () =>
        buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
          dayKey: DAY,
          manifest:
            fixtureManifest(),
          coverageReadiness:
            coverage,
          generatedAt:
            "2026-10-05T15:00:02.000Z"
        }),
      /coverage_day_mismatch/u
    );
  }
);

test(
  "manifest-only adapter rejects an invalid source manifest",
  () => {
    const manifest =
      fixtureManifest();

    manifest.hash =
      "0".repeat(64);

    assert.throws(
      () =>
        buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
          dayKey: DAY,
          manifest,
          coverageReadiness:
            fixtureCoverage(),
          generatedAt:
            "2026-10-05T15:00:02.000Z"
        }),
      /source_manifest_invalid/u
    );
  }
);

test(
  "freshness plan advertises the implemented sandbox-only adapter while keeping mutable execution unauthorized",
  () => {
    const plan =
      classifyCheckpointAwareFreshnessCoverageReadinessPlan({
        dayKey: DAY,
        freshness:
          exactFreshness()
      });

    assert.equal(
      plan.planState,
      "EXACT_COVERAGE_READINESS_REPAIR_PLAN"
    );

    assert.equal(
      plan.mutableBridgeStatus,
      "IMPLEMENTED_SANDBOX_ONLY_MUTABLE_EXECUTION_NOT_AUTHORIZED"
    );

    assert.equal(
      plan.futureExecutionRecipe[1].producer,
      "engine-v1/core/checkpoint-aware-targeted-freshness-coverage-manifest-only-adapter.js"
    );

    assert.equal(
      plan.futureExecutionRecipe[1].sandboxRunner,
      "engine-v1/jobs/run-checkpoint-aware-targeted-freshness-coverage-manifest-only-sandbox-day.js"
    );

    assert.equal(
      plan.futureExecutionRecipe[1].fullSnapshotExporterAuthorized,
      false
    );
  }
);

test(
  "executor contract advertises the sandbox-only adapter without granting mutable authority",
  () => {
    const decision = {
      dayKey: DAY,
      decisionFingerprint:
        "a".repeat(64),
      decisionState:
        "BOUNDED_REPAIR_PLAN",
      failureClass:
        "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST",
      repairUnit:
        "rebuild_coverage_readiness_then_manifest_only_reexport_preserving_value_and_details",
      resumeCheckpoint:
        "artifact_freshness_gate",
      authority: {
        projectWriteAuthorized: false,
        filesystemWriteAuthorized: false,
        repairExecutionAuthorized: false,
        productionKernelEnableAuthorized: false,
        workflowMutationAuthorized: false,
        commitAuthorized: false,
        pushAuthorized: false,
        deployAuthorized: false,
        broadDailyRecoveryAuthorized: false
      },
      executionBoundary: {
        productionKernelEnabled:
          false
      },
      executionAuthorization: {
        requiredBeforeBoundedExecution:
          true,
        authorizationGrantedByThisDecision:
          false
      }
    };

    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision
      });

    assert.equal(
      contract.repairContract.planner.manifestOnlyAdapterStatus,
      "IMPLEMENTED_SANDBOX_ONLY_MUTABLE_EXECUTION_NOT_AUTHORIZED"
    );

    assert.equal(
      contract.repairContract.planner.manifestOnlyAdapter,
      "engine-v1/core/checkpoint-aware-targeted-freshness-coverage-manifest-only-adapter.js"
    );

    assert.equal(
      contract.repairContract.planner.manifestOnlySandboxRunner,
      "engine-v1/jobs/run-checkpoint-aware-targeted-freshness-coverage-manifest-only-sandbox-day.js"
    );

    assert.equal(
      contract.repairContract.planner.currentFullSnapshotExporterAuthorized,
      false
    );

    assert.equal(
      contract.authority.mutableExecutionAuthorized,
      false
    );

    assert.equal(
      contract.authority.repositoryWriteAuthorized,
      false
    );
  }
);