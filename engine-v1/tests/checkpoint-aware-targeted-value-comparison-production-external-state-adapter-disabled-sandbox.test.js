import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCheckpointAwareValueComparisonProductionConfiguration
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

import {
  buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract,
  checkpointAwareValueComparisonProductionExternalStateDisabledSandboxFingerprint,
  createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-disabled-sandbox.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sourceR22() {
  return {
    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      state:
        "CONFIGURATION_NOT_BOUND_EXTERNAL_STATE_ADAPTER_DISABLED",

      implementation: {
        productionExternalStateAdapterConfigurationContractImplemented:
          true,

        exactR19MethodSurfacePinned:
          true,

        exactR19LockReplayJournalBackupAuditSemanticsPinned:
          true,

        productionExternalStateAdapterImplemented:
          false
      },

      requiredMethodSurface:
        [
          ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
        ],

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_DISABLED_IMPLEMENTATION_SANDBOX"
      },

      authority: {
        productionAdapterEnabled:
          false,

        productionExternalStateAdapterConstructionAuthorized:
          false,

        productionExternalStateWriteAuthorized:
          false,

        replayConsumptionAuthorized:
          false,

        signerUseAuthorized:
          false,

        privateKeyReadAuthorized:
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
        `aiml-r23-${label}-`
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

function configuration(
  value
) {
  return buildCheckpointAwareValueComparisonProductionConfiguration({
    projectRoot:
      value.projectRoot,

    authorizationIngressRoot:
      value.authorizationIngressRoot,

    externalStateRoot:
      value.externalStateRoot
  });
}

test(
  "R22 current state advances only to an isolated disabled adapter implementation sandbox",
  () => {
    const artifact =
      buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR22:
          sourceR22()
      });

    assert.equal(
      artifact.state,
      "ISOLATED_SANDBOX_IMPLEMENTATION_AVAILABLE_PRODUCTION_ROOT_DISABLED"
    );

    assert.equal(
      artifact.implementation.dedicatedExternalStateAdapterImplementationSandboxImplemented,
      true
    );

    assert.equal(
      artifact.implementation.productionRealRootEnabled,
      false
    );

    assert.equal(
      artifact.authority.productionExternalStateWriteAuthorized,
      false
    );

    assert.equal(
      artifact.blockerCount,
      4
    );
  }
);

test(
  "disabled adapter constructor exposes exactly the thirteen R22 methods on isolated temporary roots",
  () => {
    const r =
      roots(
        "shape"
      );

    try {
      const instance =
        createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter({
          productionConfiguration:
            configuration(
              r
            ),

          implementationMode:
            "ISOLATED_TEMP_SANDBOX"
        });

      assert.deepEqual(
        Object.keys(
          instance.adapter
        ),
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      );

      assert.deepEqual(
        instance.methodSurface,
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      );

      assert.equal(
        instance.authority.productionRealRootAuthorized,
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
  "disabled adapter constructor refuses any mode other than isolated temporary sandbox",
  () => {
    const r =
      roots(
        "mode"
      );

    try {
      const config =
        configuration(
          r
        );

      assert.throws(
        () =>
          createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter({
            productionConfiguration:
              config,

            implementationMode:
              "PRODUCTION"
          }),
        /sandbox_mode_invalid/u
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
  "isolated adapter preserves atomic global-lock exclusivity and owner-only release",
  () => {
    const r =
      roots(
        "lock"
      );

    try {
      const instance =
        createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter({
          productionConfiguration:
            configuration(
              r
            ),

          implementationMode:
            "ISOLATED_TEMP_SANDBOX"
        });

      const id =
        "vctxn_v1_" +
        "1".repeat(32);

      instance.adapter.acquireGlobalExecutionLockAtomically({
        transactionId:
          id,

        authorizationId:
          "vcrauth_v1_" +
          "2".repeat(32),

        transactionPlanFingerprint:
          "3".repeat(64),

        acquiredAt:
          "2026-09-23T07:10:00.000Z"
      });

      assert.throws(
        () =>
          instance.adapter.acquireGlobalExecutionLockAtomically({
            transactionId:
              "vctxn_v1_" +
              "4".repeat(32),

            authorizationId:
              "vcrauth_v1_" +
              "5".repeat(32),

            transactionPlanFingerprint:
              "6".repeat(64),

            acquiredAt:
              "2026-09-23T07:10:01.000Z"
          }),
        /global_lock_held/u
      );

      assert.throws(
        () =>
          instance.adapter.releaseGlobalExecutionLock({
            transactionId:
              "vctxn_v1_" +
              "7".repeat(32)
          }),
        /owner_mismatch/u
      );

      assert.equal(
        instance.adapter.releaseGlobalExecutionLock({
          transactionId:
            id
        }),
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
  "isolated adapter preserves atomic single-use replay consumption without release",
  () => {
    const r =
      roots(
        "replay"
      );

    try {
      const instance =
        createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter({
          productionConfiguration:
            configuration(
              r
            ),

          implementationMode:
            "ISOLATED_TEMP_SANDBOX"
        });

      const input = {
        replayKey:
          "8".repeat(64),

        authorizationId:
          "vcrauth_v1_" +
          "9".repeat(32),

        authorizationFingerprint:
          "a".repeat(64),

        transactionId:
          "vctxn_v1_" +
          "b".repeat(32),

        consumedAt:
          "2026-09-23T07:11:00.000Z"
      };

      const consumed =
        instance.adapter.consumeOnceAtomically(
          input
        );

      assert.equal(
        consumed.consumed,
        true
      );

      assert.throws(
        () =>
          instance.adapter.consumeOnceAtomically(
            input
          ),
        /replay_already_consumed/u
      );

      assert.ok(
        instance.adapter.readReplayConsumption({
          replayKey:
            input.replayKey
        })
      );

      assert.equal(
        Object.prototype.hasOwnProperty.call(
          instance.adapter,
          "releaseReplayConsumption"
        ),
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
  "disabled sandbox contract fingerprint is deterministic and next gate is real-root binding read-only",
  () => {
    const first =
      buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR22:
          sourceR22()
      });

    const second =
      buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR22:
          sourceR22()
      });

    assert.equal(
      first.sandboxContractFingerprint,
      second.sandboxContractFingerprint
    );

    assert.equal(
      first.sandboxContractFingerprint,
      checkpointAwareValueComparisonProductionExternalStateDisabledSandboxFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT_READ_ONLY"
    );
  }
);

test(
  "R23 observation runner contains no adapter construction external-state writes replay consumption signer private-key kernel invocation push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-external-state-adapter-disabled-sandbox-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bcreateCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter\s*\(/u,
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
        `R23 runner must not match ${pattern}`
      );
    }
  }
);
