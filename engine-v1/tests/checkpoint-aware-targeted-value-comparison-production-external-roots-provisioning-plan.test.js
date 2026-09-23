import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

import {
  buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan,
  checkpointAwareValueComparisonProductionRootsProvisioningPlanFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-plan.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

function sourceR24() {
  return {
    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    contract: {
      state:
        "REAL_ROOT_BINDING_SUPPORTED_NOT_PERFORMED",

      implementation: {
        persistentRealRootBindingValidatorImplemented:
          true,

        validatedProductionConfigurationRequired:
          true,

        symlinkRootsForbidden:
          true,

        osTemporaryRootsForbiddenForProductionBinding:
          true,

        driveRootBindingForbidden:
          true
      },

      requiredMethodSurface:
        [
          ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
        ],

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN_READ_ONLY"
      },

      authority: {
        productionRootsProvisioningAuthorized:
          false,

        productionConfigurationBindingAuthorized:
          false,

        productionRealRootAdapterConstructionAuthorized:
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

function safeMachineRoot(
  suffix
) {
  const parsed =
    path.parse(
      process.cwd()
    );

  if (
    process.platform ===
      "win32"
  ) {
    return path.join(
      parsed.root,
      "ProgramData",
      `AI-MatchLab-Ultra-${suffix}`
    );
  }

  return path.join(
    parsed.root,
    "var",
    "lib",
    `ai-matchlab-ultra-${suffix}`
  );
}

test(
  "R24 current state produces exact persistent machine-local root plan without provisioning",
  () => {
    const machineRoot =
      safeMachineRoot(
        "plan"
      );

    const plan =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR24:
          sourceR24(),

        projectRoot:
          process.cwd(),

        machineRoot
      });

    assert.equal(
      plan.state,
      "EXACT_PERSISTENT_ROOTS_SELECTED_NOT_PROVISIONED"
    );

    assert.equal(
      plan.machineRoot,
      path.resolve(
        machineRoot
      )
    );

    assert.equal(
      plan.authority.productionRootsProvisioningAuthorized,
      false
    );

    assert.equal(
      plan.blockerCount,
      6
    );
  }
);

test(
  "planned authorization inbox and external state are exact disjoint siblings outside repository",
  () => {
    const plan =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR24:
          sourceR24(),

        projectRoot:
          process.cwd(),

        machineRoot:
          safeMachineRoot(
            "siblings"
          )
      });

    assert.equal(
      path.basename(
        plan.roots.authorizationInbox
      ),
      "authorization-inbox"
    );

    assert.equal(
      path.basename(
        plan.roots.externalState
      ),
      "external-state"
    );

    assert.equal(
      plan.roots.authorizationInboxAndExternalStateDisjoint,
      true
    );

    assert.equal(
      plan.roots.projectRootMustRemainUnchanged,
      true
    );
  }
);

test(
  "external-state provisioning plan predeclares all five R19 persistent child directories",
  () => {
    const plan =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR24:
          sourceR24(),

        projectRoot:
          process.cwd(),

        machineRoot:
          safeMachineRoot(
            "layout"
          )
      });

    assert.deepEqual(
      plan.externalStateLayout.map(
        row =>
          row.name
      ),
      [
        "locks",
        "journals",
        "replay",
        "audits",
        "backups"
      ]
    );

    assert.equal(
      plan.externalStateLayout.every(
        row =>
          row.preProvisionBeforeProductionEnablement ===
            true
      ),
      true
    );
  }
);

test(
  "provisioning plan rejects a machine root inside the repository or OS temp",
  () => {
    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR24:
            sourceR24(),

          projectRoot:
            process.cwd(),

          machineRoot:
            path.join(
              process.cwd(),
              "runtime-state"
            )
        }),
      /machine_root_unsafe/u
    );

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR24:
            sourceR24(),

          projectRoot:
            process.cwd(),

          machineRoot:
            path.join(
              os.tmpdir(),
              "aiml-production-state"
            )
        }),
      /machine_root_unsafe/u
    );
  }
);

test(
  "permissions plan keeps authorization ingress read-only for controller and forbids private-key storage",
  () => {
    const plan =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR24:
          sourceR24(),

        projectRoot:
          process.cwd(),

        machineRoot:
          safeMachineRoot(
            "permissions"
          )
      });

    assert.equal(
      plan.permissions.authorizationInboxControllerAccess,
      "READ_ONLY"
    );

    assert.equal(
      plan.permissions.externalStateControllerAccess,
      "READ_WRITE_REQUIRED_ONLY_AFTER_FUTURE_ENABLEMENT"
    );

    assert.equal(
      plan.permissions.privateKeyMaterialStorageInEitherRootForbidden,
      true
    );

    assert.equal(
      plan.permissions.explicitAclReviewRequiredBeforeProductionEnablement,
      true
    );
  }
);

test(
  "provisioning plan preserves thirteen-method surface and points directly to provisioning precheck",
  () => {
    const plan =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR24:
          sourceR24(),

        projectRoot:
          process.cwd(),

        machineRoot:
          safeMachineRoot(
            "next"
          )
      });

    assert.deepEqual(
      plan.requiredMethodSurface,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
    );

    assert.equal(
      plan.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK"
    );

    assert.equal(
      plan.requiredNextGate.mustWriteNoReplayJournalLockAuditDuringProvisioning,
      true
    );
  }
);

test(
  "R25 plan fingerprint is deterministic and runner contains no root creation ACL mutation adapter replay signer kernel push or deploy machinery",
  () => {
    const args = {
      dayKey:
        DAY,

      remoteHead:
        HEAD,

      sourceR24:
        sourceR24(),

      projectRoot:
        process.cwd(),

      machineRoot:
        safeMachineRoot(
          "fingerprint"
        )
    };

    const first =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan(
        args
      );

    const second =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan(
        args
      );

    assert.equal(
      first.planFingerprint,
      second.planFingerprint
    );

    assert.equal(
      first.planFingerprint,
      checkpointAwareValueComparisonProductionRootsProvisioningPlanFingerprint(
        first
      )
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-plan-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bmkdirSync\b/u,
      /\bchmodSync\b/u,
      /\bchownSync\b/u,
      /\bicacls\b/u,
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
        `R25 runner must not match ${pattern}`
      );
    }
  }
);
