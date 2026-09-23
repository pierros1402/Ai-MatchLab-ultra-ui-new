import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCheckpointAwareValueComparisonProductionConfiguration
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS,
  buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract,
  checkpointAwareValueComparisonProductionExternalStateConfigurationFingerprint,
  validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sourceR21() {
  return {
    mode:
      "READ_ONLY_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      state:
        "INGRESS_IMPLEMENTED_CONFIGURATION_NOT_BOUND_DISABLED",

      implementation: {
        externalSignedAuthorizationIngressReadOnlyImplemented:
          true,

        alreadySignedDedicatedAuthorizationOnly:
          true,

        productionConfigurationValidatorImplemented:
          true,

        productionExternalStateAdapterImplemented:
          false,

        productionKernelAdapterImplemented:
          false
      },

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT_READ_ONLY"
      },

      authority: {
        productionAdapterEnabled:
          false,

        signerUseAuthorized:
          false,

        privateKeyReadAuthorized:
          false,

        replayConsumptionAuthorized:
          false,

        productionExternalStateWriteAuthorized:
          false,

        productionKernelInvocationAuthorized:
          false,

        repairExecutionAuthorized:
          false
      }
    },

    safety: {
      repositoryWritePerformed:
        false,

      productionKernelEnabled:
        false
    }
  };
}

function roots(
  label
) {
  const base =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `aiml-r22-${label}-`
      )
    );

  const projectRoot =
    path.join(
      base,
      "project"
    );

  const authorizationIngressRoot =
    path.join(
      base,
      "auth"
    );

  const externalStateRoot =
    path.join(
      base,
      "state"
    );

  fs.mkdirSync(
    projectRoot
  );

  fs.mkdirSync(
    authorizationIngressRoot
  );

  fs.mkdirSync(
    externalStateRoot
  );

  return {
    base,
    projectRoot,
    authorizationIngressRoot,
    externalStateRoot
  };
}

function cleanup(
  value
) {
  fs.rmSync(
    value.base,
    {
      recursive:
        true,
      force:
        true
    }
  );
}

test(
  "R21 current state maps to a disabled external-state adapter configuration contract with four blockers",
  () => {
    const artifact =
      buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR21:
          sourceR21()
      });

    assert.equal(
      artifact.state,
      "CONFIGURATION_NOT_BOUND_EXTERNAL_STATE_ADAPTER_DISABLED"
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
        "PRODUCTION_CONFIGURATION_NOT_BOUND",
        "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
        "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
        "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
      ]
    );

    assert.equal(
      artifact.authority.productionExternalStateAdapterConstructionAuthorized,
      false
    );
  }
);

test(
  "validated production configuration binds only the external-state root while keeping adapter and kernel disabled",
  () => {
    const r =
      roots(
        "bound"
      );

    try {
      const configuration =
        buildCheckpointAwareValueComparisonProductionConfiguration({
          projectRoot:
            r.projectRoot,

          authorizationIngressRoot:
            r.authorizationIngressRoot,

          externalStateRoot:
            r.externalStateRoot
        });

      const artifact =
        buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR21:
            sourceR21(),

          productionConfiguration:
            configuration
        });

      assert.equal(
        artifact.state,
        "CONFIGURATION_VALIDATED_EXTERNAL_STATE_ADAPTER_DISABLED"
      );

      assert.equal(
        artifact.productionConfiguration.state,
        "VALIDATED_BUT_ADAPTER_DISABLED"
      );

      assert.equal(
        artifact.productionConfiguration.externalStateRoot,
        fs.realpathSync(
          r.externalStateRoot
        )
      );

      assert.equal(
        artifact.blockerCount,
        3
      );

      assert.equal(
        artifact.implementation.productionExternalStateAdapterImplemented,
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
  "required production external-state method surface is exact and preserves the R19 contract",
  () => {
    assert.deepEqual(
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS,
      [
        "acquireGlobalExecutionLockAtomically",
        "readGlobalExecutionLock",
        "releaseGlobalExecutionLock",
        "readTransactionJournal",
        "listTransactionJournals",
        "writeOrAdvanceTransactionJournalAtomically",
        "consumeOnceAtomically",
        "readReplayConsumption",
        "writeVerifiedBackupExclusive",
        "readVerifiedBackup",
        "readExecutionAudit",
        "writeExecutionAuditAtomically",
        "inspectRecoveryObligations"
      ]
    );

    const artifact =
      buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR21:
          sourceR21()
      });

    assert.equal(
      artifact.preservedR19Semantics.atomicSingleUseReplayConsumeRequired,
      true
    );

    assert.equal(
      artifact.preservedR19Semantics.replayReleaseAfterFailure,
      false
    );

    assert.equal(
      artifact.preservedR19Semantics.retryRequiresNewAuthorization,
      true
    );

    assert.equal(
      artifact.preservedR19Semantics.ambiguousTargetStateFailsToRecoveryRequired,
      true
    );
  }
);

test(
  "adapter shape validator requires all thirteen exact R19 external-state methods",
  () => {
    const complete =
      Object.fromEntries(
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
          .map(
            name => [
              name,
              () => {}
            ]
          )
      );

    assert.equal(
      validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape(
        complete
      ),
      true
    );

    delete complete.consumeOnceAtomically;

    assert.throws(
      () =>
        validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape(
          complete
        ),
      /methods_missing:consumeOnceAtomically/u
    );
  }
);

test(
  "unreviewed production external-state adapter activation fails closed",
  () => {
    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR21:
            sourceR21(),

          productionExternalStateAdapterImplemented:
            true
        }),
      /unreviewed_adapter_activation/u
    );
  }
);

test(
  "R21 authority drift cannot silently authorize external-state configuration",
  () => {
    const bad =
      sourceR21();

    bad.contract.authority
      .productionExternalStateWriteAuthorized =
        true;

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR21:
            bad
        }),
      /r21_boundary_invalid/u
    );
  }
);

test(
  "configuration contract fingerprint is deterministic and next gate stays a disabled implementation sandbox",
  () => {
    const first =
      buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR21:
          sourceR21()
      });

    const second =
      buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR21:
          sourceR21()
      });

    assert.equal(
      first.configurationContractFingerprint,
      second.configurationContractFingerprint
    );

    assert.equal(
      first.configurationContractFingerprint,
      checkpointAwareValueComparisonProductionExternalStateConfigurationFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_DISABLED_IMPLEMENTATION_SANDBOX"
    );
  }
);

test(
  "R22 observation runner contains no external-state writer replay consumption signer private-key kernel invocation push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bacquireGlobalExecutionLockAtomically\s*\(/u,
      /\bconsumeOnceAtomically\s*\(/u,
      /\bwriteOrAdvanceTransactionJournalAtomically\s*\(/u,
      /\bwriteVerifiedBackupExclusive\s*\(/u,
      /\bwriteExecutionAuditAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
      /\bunlinkSync\b/u,
      /\bexecuteAutonomousRepairProductionExecution\s*\(/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\s*\(/u,
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
        `R22 runner must not match ${pattern}`
      );
    }
  }
);
