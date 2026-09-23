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
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE,
  buildCheckpointAwareValueComparisonProductionRealRootBindingContract,
  checkpointAwareValueComparisonProductionRealRootBindingContractFingerprint,
  validateCheckpointAwareValueComparisonProductionRealRootBinding
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sourceR23() {
  return {
    mode:
      "DISABLED_PRODUCTION_EXTERNAL_STATE_ADAPTER_IMPLEMENTATION_SANDBOX",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      state:
        "ISOLATED_SANDBOX_IMPLEMENTATION_AVAILABLE_PRODUCTION_ROOT_DISABLED",

      implementation: {
        dedicatedExternalStateAdapterImplementationSandboxImplemented:
          true,

        delegatesToR19VerifiedExternalStatePrimitive:
          true,

        exactThirteenMethodSurfaceImplemented:
          true,

        productionRealRootBindingImplemented:
          false,

        productionRealRootEnabled:
          false
      },

      requiredMethodSurface:
        [
          ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
        ],

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT_READ_ONLY"
      },

      authority: {
        productionConfigurationBindingAuthorized:
          false,

        productionExternalStateRealRootConstructionAuthorized:
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
        `aiml-r24-${label}-`
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

  const otherProjectRoot =
    path.join(
      base,
      "other-project"
    );

  for (
    const directory of
      [
        projectRoot,
        authorizationIngressRoot,
        externalStateRoot,
        otherProjectRoot
      ]
  ) {
    fs.mkdirSync(
      directory
    );
  }

  return {
    base,
    projectRoot,
    authorizationIngressRoot,
    externalStateRoot,
    otherProjectRoot
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
  "R23 current state advances to a read-only persistent real-root binding contract without performing binding",
  () => {
    const artifact =
      buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR23:
          sourceR23()
      });

    assert.equal(
      artifact.state,
      "REAL_ROOT_BINDING_SUPPORTED_NOT_PERFORMED"
    );

    assert.equal(
      artifact.blockerCount,
      4
    );

    assert.equal(
      artifact.authority.productionRootsProvisioningAuthorized,
      false
    );

    assert.equal(
      artifact.authority.productionRealRootAdapterConstructionAuthorized,
      false
    );
  }
);

test(
  "real-root binding contract preserves the exact thirteen-method external-state surface",
  () => {
    const artifact =
      buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR23:
          sourceR23()
      });

    assert.deepEqual(
      artifact.requiredMethodSurface,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
    );

    assert.equal(
      artifact.implementation.adapterConstructionPerformedByBindingValidator,
      false
    );

    assert.equal(
      artifact.implementation.externalStateWritePerformedByBindingValidator,
      false
    );

    assert.equal(
      artifact.implementation.replayConsumptionPerformedByBindingValidator,
      false
    );
  }
);

test(
  "isolated contract-test binding validates a configuration without granting production authority",
  () => {
    const r =
      roots(
        "test-binding"
      );

    try {
      const binding =
        validateCheckpointAwareValueComparisonProductionRealRootBinding({
          productionConfiguration:
            configuration(
              r
            ),

          expectedProjectRoot:
            r.projectRoot,

          bindingMode:
            CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
              .ISOLATED_CONTRACT_TEST
        });

      assert.equal(
        binding.bindingMode,
        "ISOLATED_CONTRACT_TEST"
      );

      assert.equal(
        binding.rootsDisjoint,
        true
      );

      assert.equal(
        binding.adapterConstructionPerformed,
        false
      );

      assert.equal(
        binding.externalStateWritePerformed,
        false
      );

      assert.equal(
        binding.authority.productionRealRootAdapterConstructionAuthorized,
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
  "persistent production binding rejects OS temporary roots",
  () => {
    const r =
      roots(
        "persistent"
      );

    try {
      assert.throws(
        () =>
          validateCheckpointAwareValueComparisonProductionRealRootBinding({
            productionConfiguration:
              configuration(
                r
              ),

            expectedProjectRoot:
              r.projectRoot,

            bindingMode:
              CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
                .PERSISTENT_PRODUCTION
          }),
        /persistent_root_under_os_temp/u
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
  "real-root binding rejects configuration whose project root is not the expected process project root",
  () => {
    const r =
      roots(
        "project-mismatch"
      );

    try {
      assert.throws(
        () =>
          validateCheckpointAwareValueComparisonProductionRealRootBinding({
            productionConfiguration:
              configuration(
                r
              ),

            expectedProjectRoot:
              r.otherProjectRoot,

            bindingMode:
              CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
                .ISOLATED_CONTRACT_TEST
          }),
        /project_root_mismatch/u
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
  "R23 authority drift fails closed before any real-root binding contract can be produced",
  () => {
    const bad =
      sourceR23();

    bad.contract.authority
      .productionExternalStateWriteAuthorized =
        true;

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR23:
            bad
        }),
      /r23_boundary_invalid/u
    );
  }
);

test(
  "R24 contract fingerprint is deterministic and observation runner contains no env binding root creation adapter construction replay signer kernel push or deploy machinery",
  () => {
    const first =
      buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR23:
          sourceR23()
      });

    const second =
      buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR23:
          sourceR23()
      });

    assert.equal(
      first.contractFingerprint,
      second.contractFingerprint
    );

    assert.equal(
      first.contractFingerprint,
      checkpointAwareValueComparisonProductionRealRootBindingContractFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN_READ_ONLY"
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bprocess\.env\b/u,
      /\bmkdirSync\b/u,
      /\bcreateCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter\s*\(/u,
      /\bacquireGlobalExecutionLockAtomically\s*\(/u,
      /\bconsumeOnceAtomically\s*\(/u,
      /\bwriteOrAdvanceTransactionJournalAtomically\s*\(/u,
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
        `R24 runner must not match ${pattern}`
      );
    }
  }
);
