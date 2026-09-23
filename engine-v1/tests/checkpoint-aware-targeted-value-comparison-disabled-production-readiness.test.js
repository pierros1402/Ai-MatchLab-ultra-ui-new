import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_STATE,
  buildCheckpointAwareValueComparisonDisabledProductionReadinessContract,
  checkpointAwareValueComparisonProductionReadinessFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-disabled-production-readiness.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function r19({
  mutationCount = 0,
  overrides = {}
} = {}) {
  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-external-state-crash-recovery-sandbox-day.v1",

    mode:
      "EXTERNAL_STATE_REPLAY_JOURNAL_CRASH_RECOVERY_SANDBOX",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    recoveryState:
      mutationCount ===
        0
        ? "NO_EXTERNAL_STATE_SANDBOX_REQUIRED_CURRENT_STATE"
        : "AWAITING_VERIFIED_TRANSACTION_AND_SOURCE_BOUND_MATERIAL",

    proposedMutationCount:
      mutationCount,

    implementation: {
      dedicatedExternalStateSandboxAdapterImplemented:
        true,
      externalGlobalLockImplemented:
        true,
      singleUseAtomicReplayConsumptionImplementedInSandbox:
        true,
      durableJournalStateMachineImplemented:
        true,
      verifiedExternalBackupImplemented:
        true,
      crashAfterFirstApplySimulationImplemented:
        true,
      recoveryClassifiesPreimagePostimageAmbiguous:
        true,
      reverseRollbackFromDurableJournalImplemented:
        true,
      terminalAuditImplemented:
        true,
      ambiguousStateFailsToRecoveryRequired:
        true,
      replayReleaseAfterFailure:
        false,
      retryRequiresNewAuthorization:
        true,
      productionExternalStateAdapterImplemented:
        false,
      productionKernelAdapterImplemented:
        false
    },

    safety: {
      repositoryWritePerformed:
        false,
      replayConsumptionPerformedThisObservation:
        false,
      authorizationArtifactCreated:
        false,
      signerUse:
        false,
      privateKeyRead:
        false,
      productionKernelInvoked:
        false,
      productionKernelEnabled:
        false,
      authorizationGrantAuthority:
        false,
      repairExecutionAuthority:
        false
    },

    ...overrides
  };
}

function legacy() {
  return {
    mode:
      "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      adapterState:
        "DISABLED_NO_MUTATION_REQUIRED",

      route: {
        dedicatedRepairClass:
          "REBUILD_VALUE_COMPARISON_ONLY"
      },

      authority: {
        adapterEnabled:
          false,
        protectedPathBypassAuthorized:
          false,
        productionKernelInvocationAuthorized:
          false
      },

      legacyCompatibility: {
        authorizationV2SupportsDedicatedRepairClass:
          false,
        transactionPlanSupportsDedicatedRepairClass:
          false
      },

      productionExecutionBoundary: {
        existingProductionEntrypointCompatible:
          false,
        existingAuthorizationV2Compatible:
          false,
        existingTransactionPlanCompatible:
          false
      }
    }
  };
}

function generic() {
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
      false
  };
}

function build({
  mutationCount = 0,
  sourceR19 = null,
  legacySource = null,
  genericSource = null,
  productionFlags = {}
} = {}) {
  return buildCheckpointAwareValueComparisonDisabledProductionReadinessContract({
    dayKey:
      DAY,

    remoteHead:
      HEAD,

    sourceR19:
      sourceR19 ||
      r19({
        mutationCount
      }),

    legacyDisabledAdapter:
      legacySource ||
      legacy(),

    genericProductionReadiness:
      genericSource ||
      generic(),

    externalAuthorizationIngressImplemented:
      productionFlags.externalAuthorizationIngressImplemented ??
      false,

    dedicatedProductionExternalStateAdapterImplemented:
      productionFlags.dedicatedProductionExternalStateAdapterImplemented ??
      false,

    dedicatedProductionKernelAdapterImplemented:
      productionFlags.dedicatedProductionKernelAdapterImplemented ??
      false,

    endToEndProductionOrchestratorImplemented:
      productionFlags.endToEndProductionOrchestratorImplemented ??
      false
  });
}

test(
  "healthy current state remains production-disabled and exposes exact missing production interfaces",
  () => {
    const artifact =
      build();

    assert.equal(
      artifact.currentState.routeState,
      "NO_MUTATION_REQUIRED_CURRENT_STATE"
    );

    assert.equal(
      artifact.currentState.productionReadinessState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_STATE
        .DISABLED_PREREQUISITES_INCOMPLETE
    );

    assert.equal(
      artifact.blockerCount,
      4
    );

    assert.deepEqual(
      artifact.blockers.map(
        row =>
          row.code
      ),
      [
        "EXTERNAL_SIGNED_AUTHORIZATION_INGRESS_NOT_IMPLEMENTED",
        "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
        "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
        "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
      ]
    );
  }
);

test(
  "mutation candidate remains disabled rather than gaining authority from completed sandbox foundations",
  () => {
    const artifact =
      build({
        mutationCount:
          2
      });

    assert.equal(
      artifact.currentState.routeState,
      "MUTATION_CANDIDATE_REMAINS_PRODUCTION_DISABLED"
    );

    assert.equal(
      artifact.currentState.proposedMutationCount,
      2
    );

    assert.equal(
      artifact.authority.productionAdapterEnabled,
      false
    );

    assert.equal(
      artifact.authority.repairExecutionAuthorized,
      false
    );
  }
);

test(
  "R19 durable recovery foundation is mandatory and production adapters must still be absent",
  () => {
    const bad =
      r19();

    bad.implementation
      .durableJournalStateMachineImplemented =
        false;

    assert.throws(
      () =>
        build({
          sourceR19:
            bad
        }),
      /r19_boundary_invalid/u
    );

    const unexpectedlyProduction =
      r19();

    unexpectedlyProduction
      .implementation
      .productionKernelAdapterImplemented =
        true;

    assert.throws(
      () =>
        build({
          sourceR19:
            unexpectedlyProduction
        }),
      /r19_boundary_invalid/u
    );
  }
);

test(
  "legacy value-comparison protection remains intact and cannot be bypassed for readiness",
  () => {
    const bad =
      legacy();

    bad.contract.authority
      .protectedPathBypassAuthorized =
        true;

    assert.throws(
      () =>
        build({
          legacySource:
            bad
        }),
      /legacy_boundary_invalid/u
    );

    const artifact =
      build();

    assert.equal(
      artifact.preservedInvariants.legacyProtectedPathBypassAuthorized,
      false
    );

    assert.equal(
      artifact.preservedInvariants.genericLegacyStackModified,
      false
    );
  }
);

test(
  "generic production kernel must still be disabled while the dedicated readiness contract is evaluated",
  () => {
    const bad =
      generic();

    bad.productionKernelEnabled =
      true;

    assert.throws(
      () =>
        build({
          genericSource:
            bad
        }),
      /generic_boundary_invalid/u
    );
  }
);

test(
  "unreviewed production interface activation fails closed instead of silently enabling execution",
  () => {
    for (
      const key of
        [
          "externalAuthorizationIngressImplemented",
          "dedicatedProductionExternalStateAdapterImplemented",
          "dedicatedProductionKernelAdapterImplemented",
          "endToEndProductionOrchestratorImplemented"
        ]
    ) {
      assert.throws(
        () =>
          build({
            productionFlags: {
              [key]:
                true
            }
          }),
        /unreviewed_production_surface_detected/u
      );
    }
  }
);

test(
  "readiness fingerprint is deterministic and the next gate remains read-only external authorization ingress plus production configuration",
  () => {
    const first =
      build();

    const second =
      build();

    assert.equal(
      first.readinessFingerprint,
      second.readinessFingerprint
    );

    assert.equal(
      first.readinessFingerprint,
      checkpointAwareValueComparisonProductionReadinessFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT_READ_ONLY"
    );

    assert.equal(
      first.requiredNextGate.mustNotSignInsideRepository,
      true
    );

    assert.equal(
      first.requiredNextGate.mustNotReadPrivateKey,
      true
    );
  }
);

test(
  "R20 runner contains no signer private-key replay consumption production writer kernel invocation push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-disabled-production-readiness-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bexecuteAutonomousRepairProductionExecution\s*\(/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\s*\(/u,
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
        `R20 runner must not match ${pattern}`
      );
    }
  }
);
