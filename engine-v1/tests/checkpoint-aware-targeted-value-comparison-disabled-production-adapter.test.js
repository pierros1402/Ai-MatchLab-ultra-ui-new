import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE,
  buildCheckpointAwareValueComparisonDisabledProductionAdapterContract,
  checkpointAwareValueComparisonDisabledProductionAdapterFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-disabled-production-adapter.js";

const DAY =
  "2026-09-23";

function compatibility(
  overrides = {}
) {
  return {
    genericPlanProtectsValueComparison:
      true,

    targetVerifierProtectsValueComparison:
      true,

    authorizationV2SupportedRepairClasses: [
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
      "REBUILD_HISTORY_ELIGIBLE_ROW",
      "REBUILD_PUBLICATION_CANONICAL_ROW"
    ],

    transactionPlanSupportedRepairClasses: [
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
      "REBUILD_HISTORY_ELIGIBLE_ROW",
      "REBUILD_PUBLICATION_CANONICAL_ROW"
    ],

    ...overrides
  };
}

function readiness(
  overrides = {}
) {
  return {
    state:
      "BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED",

    trustedKeyCount:
      1,

    pinnedTrustRequired:
      true,

    callerSuppliedTrustForbidden:
      true,

    callerSuppliedProjectRootForbidden:
      true,

    productionKernelEnabled:
      false,

    ...overrides
  };
}

function build({
  mutationCount = 0,
  compatibilityOverrides = {},
  readinessOverrides = {}
} = {}) {
  const hasMutation =
    mutationCount >
      0;

  return buildCheckpointAwareValueComparisonDisabledProductionAdapterContract({
    dayKey:
      DAY,

    sourcePreflightState:
      hasMutation
        ? "MUTATION_CANDIDATE_READY"
        : "NO_MUTATION_REQUIRED",

    proposedMutationCount:
      mutationCount,

    sourceSandboxSimulationState:
      hasMutation
        ? "SIMULATED_AND_ROLLED_BACK"
        : "NO_TRANSACTION_REQUIRED",

    sourceSandboxRollbackVerified:
      hasMutation,

    compatibility:
      compatibility(
        compatibilityOverrides
      ),

    productionExecutionReadiness:
      readiness(
        readinessOverrides
      )
  });
}

test(
  "no-op route remains disabled and requires no production transaction",
  () => {
    const artifact =
      build();

    assert.equal(
      artifact.adapterState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE
        .DISABLED_NO_MUTATION_REQUIRED
    );

    assert.equal(
      artifact.sourceEvidence.proposedMutationCount,
      0
    );

    assert.equal(
      artifact.authority.adapterEnabled,
      false
    );
  }
);

test(
  "mutation candidate remains disabled after verified sandbox rollback",
  () => {
    const artifact =
      build({
        mutationCount:
          2
      });

    assert.equal(
      artifact.adapterState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE
        .DISABLED_EXECUTION_STACK_INCOMPATIBLE
    );

    assert.equal(
      artifact.blockers.length,
      5
    );

    assert.equal(
      artifact.blockers.every(
        row =>
          row.blocking ===
            true
      ),
      true
    );
  }
);

test(
  "legacy value-comparison protection must remain proven and cannot be bypassed",
  () => {
    assert.throws(
      () =>
        build({
          compatibilityOverrides: {
            targetVerifierProtectsValueComparison:
              false
          }
        }),
      /legacy_path_protection_not_proven/u
    );

    const artifact =
      build({
        mutationCount:
          1
      });

    assert.equal(
      artifact.authority.protectedPathBypassAuthorized,
      false
    );
  }
);

test(
  "legacy authorization and transaction schemas must not silently gain the dedicated repair class",
  () => {
    assert.throws(
      () =>
        build({
          compatibilityOverrides: {
            authorizationV2SupportedRepairClasses: [
              "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
              "REBUILD_HISTORY_ELIGIBLE_ROW",
              "REBUILD_PUBLICATION_CANONICAL_ROW",
              "REBUILD_VALUE_COMPARISON_ONLY"
            ]
          }
        }),
      /legacy_repair_class_surface_unexpected|dedicated_class_unexpectedly_supported/u
    );

    const artifact =
      build({
        mutationCount:
          1
      });

    assert.equal(
      artifact
        .productionExecutionBoundary
        .existingAuthorizationV2Compatible,
      false
    );

    assert.equal(
      artifact
        .productionExecutionBoundary
        .existingTransactionPlanCompatible,
      false
    );
  }
);

test(
  "production kernel must remain disabled and no signer or authorization creation is granted",
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

    const artifact =
      build({
        mutationCount:
          1
      });

    assert.equal(
      artifact.authority.signerUseAuthorized,
      false
    );

    assert.equal(
      artifact.authority.authorizationArtifactCreationAuthorized,
      false
    );

    assert.equal(
      artifact.authority.productionKernelInvocationAuthorized,
      false
    );
  }
);

test(
  "disabled adapter fingerprint is stable and runner contains no production execution machinery",
  () => {
    const artifact =
      build({
        mutationCount:
          1
      });

    assert.equal(
      artifact.adapterFingerprint,
      checkpointAwareValueComparisonDisabledProductionAdapterFingerprint(
        artifact
      )
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-disabled-production-adapter-contract-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "executeAutonomousRepairProductionExecution",
        "prepareAutonomousRepairProductionExecutionWithPinnedTrust",
        "privateKey",
        "sign(",
        "git push",
        "git commit",
        "workflow_dispatch",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `R13 runner must not contain ${forbidden}`
      );
    }
  }
);
