import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE,
  buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck,
  checkpointAwareValueComparisonProductionRootsPrecheckFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-execution-precheck.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const MACHINE_ROOT =
  process.platform ===
    "win32"
    ? "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime"
    : "/var/lib/ai-matchlab-ultra/controller-runtime";

function sourceR25() {
  const authorizationInbox =
    `${MACHINE_ROOT}${requireSeparator()}authorization-inbox`;

  const externalState =
    `${MACHINE_ROOT}${requireSeparator()}external-state`;

  const layoutNames = [
    "locks",
    "journals",
    "replay",
    "audits",
    "backups"
  ];

  return {
    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    plan: {
      state:
        "EXACT_PERSISTENT_ROOTS_SELECTED_NOT_PROVISIONED",

      machineRoot:
        MACHINE_ROOT,

      roots: {
        authorizationInbox,
        externalState
      },

      externalStateLayout:
        layoutNames.map(
          name => ({
            name,
            path:
              `${externalState}${requireSeparator()}${name}`
          })
        ),

      requiredMethodSurface:
        [
          ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
        ],

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK"
      },

      authority: {
        productionRootsProvisioningAuthorized:
          false,

        aclMutationAuthorized:
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
      },

      planFingerprint:
        "f".repeat(64)
    },

    safety: {
      repositoryWritePerformed:
        false,

      productionRootsCreated:
        false,

      aclMutationPerformed:
        false,

      productionKernelEnabled:
        false
    }
  };
}

function requireSeparator() {
  return process.platform ===
    "win32"
    ? "\\"
    : "/";
}

function observation({
  existingTargets = [],
  redirected = false,
  writable = true
} = {}) {
  const source =
    sourceR25();

  const targets = [
    source.plan.machineRoot,
    source.plan.roots.authorizationInbox,
    source.plan.roots.externalState,
    ...source.plan.externalStateLayout.map(
      row =>
        row.path
    )
  ];

  return {
    machineRoot:
      source.plan.machineRoot,

    plannedTargets:
      targets,

    existingPlannedTargets:
      existingTargets,

    existingAncestors: [
      {
        path:
          process.platform ===
            "win32"
            ? "C:\\ProgramData"
            : "/var/lib",

        isDirectory:
          true,

        isSymbolicLink:
          false,

        realPath:
          process.platform ===
            "win32"
            ? "C:\\ProgramData"
            : "/var/lib",

        redirected
      }
    ],

    nearestExistingAncestor:
      process.platform ===
        "win32"
        ? "C:\\ProgramData"
        : "/var/lib",

    nearestExistingAncestorWritable:
      writable,

    anyAncestorRedirected:
      redirected
  };
}

test(
  "clean absent target set passes final read-only precheck without granting provisioning authority",
  () => {
    const result =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR25:
          sourceR25(),

        filesystemObservation:
          observation(),

        processElevated:
          true
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .READY
    );

    assert.equal(
      result.readyForNextGate,
      true
    );

    assert.equal(
      result.authority.productionRootsProvisioningAuthorized,
      false
    );
  }
);

test(
  "non-elevated Windows precheck routes to a new elevated shell without failing the read-only gate",
  () => {
    const result =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR25:
          sourceR25(),

        filesystemObservation:
          observation(),

        processElevated:
          false
      });

    if (
      process.platform ===
        "win32"
    ) {
      assert.equal(
        result.state,
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
          .READY_ELEVATION_REQUIRED
      );

      assert.equal(
        result.privilegeObservation.newElevatedShellRequired,
        true
      );
    }
    else {
      assert.equal(
        result.state,
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
          .READY
      );
    }
  }
);

test(
  "preexisting planned target paths fail closed before provisioning",
  () => {
    const result =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR25:
          sourceR25(),

        filesystemObservation:
          observation({
            existingTargets: [
              sourceR25().plan.machineRoot
            ]
          }),

        processElevated:
          true
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_PREEXISTING_TARGETS
    );

    assert.equal(
      result.readyForNextGate,
      false
    );
  }
);

test(
  "existing ancestor redirection fails closed before any directory creation",
  () => {
    const result =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR25:
          sourceR25(),

        filesystemObservation:
          observation({
            redirected:
              true
          }),

        processElevated:
          true
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_ANCESTOR_REDIRECTION
    );

    assert.equal(
      result.blockerCount,
      1
    );
  }
);

test(
  "elevated process with non-writable nearest ancestor fails closed",
  () => {
    const result =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR25:
          sourceR25(),

        filesystemObservation:
          observation({
            writable:
              false
          }),

        processElevated:
          true
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_ANCESTOR_ACCESS
    );
  }
);

test(
  "R25 authority drift fails closed before provisioning readiness can be emitted",
  () => {
    const bad =
      sourceR25();

    bad.plan.authority
      .productionRootsProvisioningAuthorized =
        true;

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR25:
            bad,

          filesystemObservation:
            observation(),

          processElevated:
            true
        }),
      /r25_boundary_invalid/u
    );
  }
);

test(
  "R26 fingerprint is deterministic and runner has no root creation ACL mutation replay signer kernel push or deploy machinery",
  () => {
    const args = {
      dayKey:
        DAY,

      remoteHead:
        HEAD,

      sourceR25:
        sourceR25(),

      filesystemObservation:
        observation(),

      processElevated:
        true
    };

    const first =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck(
        args
      );

    const second =
      buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck(
        args
      );

    assert.equal(
      first.precheckFingerprint,
      second.precheckFingerprint
    );

    assert.equal(
      first.precheckFingerprint,
      checkpointAwareValueComparisonProductionRootsPrecheckFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION"
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-execution-precheck-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bmkdirSync\b/u,
      /\bchmodSync\b/u,
      /\bchownSync\b/u,
      /\bicacls\b/u,
      /\bSet-Acl\b/u,
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
        `R26 runner must not match ${pattern}`
      );
    }
  }
);
