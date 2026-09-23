import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCheckpointAwareValueComparisonProductionConfiguration
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE,
  checkpointAwareValueComparisonProductionRealRootBindingFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding.js";

import {
  buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification,
  checkpointAwareValueComparisonProductionConfigurationRealRootAclVerificationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-configuration-real-root-acl-verification.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const SYSTEM_SID =
  "S-1-5-18";

const ADMIN_SID =
  "S-1-5-32-544";

const CONTROLLER_SID =
  "S-1-5-21-111-222-333-1001";

function roots(
  label
) {
  const base =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        `aiml-r28-${label}-`
      )
    );

  const projectRoot =
    path.join(
      base,
      "project"
    );

  const machineRoot =
    path.join(
      base,
      "runtime"
    );

  const authorizationInbox =
    path.join(
      machineRoot,
      "authorization-inbox"
    );

  const externalState =
    path.join(
      machineRoot,
      "external-state"
    );

  const directories = [
    projectRoot,
    machineRoot,
    authorizationInbox,
    externalState,
    path.join(
      externalState,
      "locks"
    ),
    path.join(
      externalState,
      "journals"
    ),
    path.join(
      externalState,
      "replay"
    ),
    path.join(
      externalState,
      "audits"
    ),
    path.join(
      externalState,
      "backups"
    )
  ];

  for (
    const directory of
      directories
  ) {
    fs.mkdirSync(
      directory,
      {
        recursive:
          true
      }
    );
  }

  return {
    base,
    projectRoot,
    machineRoot,
    authorizationInbox,
    externalState,
    provisionedDirectories:
      directories.slice(
        1
      )
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
      value.authorizationInbox,

    externalStateRoot:
      value.externalState,

    productionAdapterEnabled:
      false
  });
}

function binding(
  config
) {
  const artifact = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-real-root-binding.v1",

    version:
      "1.0.0",

    role:
      "read_only_persistent_production_external_state_real_root_binding",

    bindingMode:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
        .PERSISTENT_PRODUCTION,

    projectRoot:
      config.projectRootBinding.projectRoot,

    authorizationIngressRoot:
      config.authorizationIngress.root,

    externalStateRoot:
      config.externalState.root,

    productionConfigurationFingerprint:
      config.configurationFingerprint,

    persistentRootRequired:
      true,

    rootsDisjoint:
      true,

    externalStateRootOutsideRepository:
      true,

    externalStateRootOutsideOsTemp:
      true,

    authorizationIngressRootOutsideOsTemp:
      true,

    adapterConstructionPerformed:
      false,

    externalStateWritePerformed:
      false,

    replayConsumptionPerformed:
      false,

    authority: {
      readOnly:
        true,

      productionConfigurationAcceptedAsEvidenceOnly:
        true,

      productionRealRootAdapterConstructionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false
    }
  };

  artifact.bindingFingerprint =
    checkpointAwareValueComparisonProductionRealRootBindingFingerprint(
      artifact
    );

  return artifact;
}

function aclEvidence(
  value
) {
  return {
    model:
      "WINDOWS_DACL_BASELINE_V1",

    controllerSid:
      CONTROLLER_SID,

    ownerSid:
      ADMIN_SID,

    systemSid:
      SYSTEM_SID,

    administratorsSid:
      ADMIN_SID,

    directoryCount:
      8,

    fileCount:
      0,

    directories:
      value.provisionedDirectories.map(
        directory => ({
          path:
            directory,

          exists:
            true,

          isDirectory:
            true,

          reparsePoint:
            false,

          ownerSid:
            ADMIN_SID,

          accessRulesProtected:
            true,

          inheritedRuleCount:
            0,

          explicitRuleCount:
            3,

          systemFullControl:
            true,

          administratorsFullControl:
            true,

          controllerReadExecute:
            true,

          controllerForbiddenWriteRightsPresent:
            false
        })
      )
  };
}

function build(
  value,
  evidence =
    null
) {
  const config =
    configuration(
      value
    );

  return buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification({
    dayKey:
      DAY,

    remoteHead:
      HEAD,

    productionConfiguration:
      config,

    realRootBinding:
      binding(
        config
      ),

    aclEvidence:
      evidence ||
      aclEvidence(
        value
      )
  });
}

test(
  "exact provisioned root configuration and baseline ACL evidence bind read-only while production stays disabled",
  () => {
    const r =
      roots(
        "pass"
      );

    try {
      const artifact =
        build(
          r
        );

      assert.equal(
        artifact.state,
        "PRODUCTION_CONFIGURATION_BOUND_REAL_ROOTS_ACL_VERIFIED_DISABLED"
      );

      assert.equal(
        artifact.aclVerification.exactDirectoryCount,
        8
      );

      assert.equal(
        artifact.aclVerification.exactFileCount,
        0
      );

      assert.equal(
        artifact.authority.productionExternalStateWriteAuthorized,
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
  "ACL evidence with a missing or unexpected directory fails closed",
  () => {
    const r =
      roots(
        "directory-set"
      );

    try {
      const evidence =
        aclEvidence(
          r
        );

      evidence.directories[0].path =
        path.join(
          r.base,
          "unexpected"
        );

      assert.throws(
        () =>
          build(
            r,
            evidence
          ),
        /directory_set_invalid/u
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
  "ACL owner inheritance or explicit-rule drift fails closed",
  () => {
    const r =
      roots(
        "acl-drift"
      );

    try {
      for (
        const mutate of
          [
            evidence => {
              evidence.directories[0].ownerSid =
                "S-1-5-32-545";
            },
            evidence => {
              evidence.directories[0].accessRulesProtected =
                false;
            },
            evidence => {
              evidence.directories[0].explicitRuleCount =
                4;
            }
          ]
      ) {
        const evidence =
          aclEvidence(
            r
          );

        mutate(
          evidence
        );

        assert.throws(
          () =>
            build(
              r,
              evidence
            ),
          /directory_baseline_invalid/u
        );
      }
    }
    finally {
      cleanup(
        r
      );
    }
  }
);

test(
  "controller write rights on the baseline roots fail closed",
  () => {
    const r =
      roots(
        "controller-write"
      );

    try {
      const evidence =
        aclEvidence(
          r
        );

      evidence.directories[2]
        .controllerForbiddenWriteRightsPresent =
          true;

      assert.throws(
        () =>
          build(
            r,
            evidence
          ),
        /directory_baseline_invalid/u
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
  "reparse point evidence fails closed before any production adapter construction",
  () => {
    const r =
      roots(
        "reparse"
      );

    try {
      const evidence =
        aclEvidence(
          r
        );

      evidence.directories[4]
        .reparsePoint =
          true;

      assert.throws(
        () =>
          build(
            r,
            evidence
          ),
        /directory_baseline_invalid/u
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
  "binding fingerprint or configuration fingerprint drift fails closed",
  () => {
    const r =
      roots(
        "fingerprint-drift"
      );

    try {
      const config =
        configuration(
          r
        );

      const bind =
        binding(
          config
        );

      bind.bindingFingerprint =
        "0".repeat(64);

      assert.throws(
        () =>
          buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification({
            dayKey:
              DAY,

            remoteHead:
              HEAD,

            productionConfiguration:
              config,

            realRootBinding:
              bind,

            aclEvidence:
              aclEvidence(
                r
              )
          }),
        /binding_fingerprint_invalid/u
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
  "verification fingerprint is deterministic and next gate is runtime identities plus ACL activation planning",
  () => {
    const r =
      roots(
        "fingerprint"
      );

    try {
      const first =
        build(
          r
        );

      const second =
        build(
          r
        );

      assert.equal(
        first.verificationFingerprint,
        second.verificationFingerprint
      );

      assert.equal(
        first.verificationFingerprint,
        checkpointAwareValueComparisonProductionConfigurationRealRootAclVerificationFingerprint(
          first
        )
      );

      assert.equal(
        first.requiredNextGate.name,
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN_READ_ONLY"
      );

      assert.equal(
        first.blockerCount,
        5
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
  "R28 runner contains no ACL mutation adapter construction replay signer private-key kernel push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-configuration-real-root-acl-verification-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bchmodSync\b/u,
      /\bchownSync\b/u,
      /\bicacls\b/u,
      /\bSet-Acl\b/u,
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
        `R28 runner must not match ${pattern}`
      );
    }
  }
);
