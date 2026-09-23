import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE,
  buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck,
  checkpointAwareValueComparisonRuntimeIdentitiesAclPrecheckFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-precheck.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const MACHINE_ROOT =
  "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime";

const AUTH =
  `${MACHINE_ROOT}\\authorization-inbox`;

const STATE =
  `${MACHINE_ROOT}\\external-state`;

function sourceR29() {
  return {
    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    plan: {
      state:
        "DEDICATED_RUNTIME_IDENTITIES_SELECTED_NOT_PROVISIONED",

      readyForIdentityProvisioningPrecheck:
        true,

      machine: {
        machineRoot:
          MACHINE_ROOT,

        authorizationInbox:
          AUTH,

        externalStateRoot:
          STATE
      },

      cryptographicIssuer: {
        signerCustodyRemainsSeparate:
          true
      },

      operatingSystemPrincipals: {
        authorizationDeliveryPrincipal: {
          account:
            "PIER-LENOVO\\AIMLAuthAgent",

          exists:
            false,

          cryptographicSigner:
            false
        },

        controllerRuntimePrincipal: {
          account:
            "PIER-LENOVO\\AIMLController",

          exists:
            false,

          cryptographicSigner:
            false
        }
      },

      aclActivationPlan: {
        externalState: {
          appliesToRootAndExactChildren: [
            "external-state",
            "locks",
            "journals",
            "replay",
            "audits",
            "backups"
          ]
        }
      },

      securityModel: {
        privateKeyInRepositoryForbidden:
          true,

        privateKeyInControllerRuntimeRootsForbidden:
          true,

        privateKeyReadByControllerForbidden:
          true,

        privateKeyReadByRuntimeWriterForbidden:
          true
      },

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK"
      },

      authority: {
        localAccountCreationAuthorized:
          false,

        localGroupMembershipMutationAuthorized:
          false,

        aclMutationAuthorized:
          false,

        authorizationDeliveryWriteAclAuthorized:
          false,

        productionRuntimeWriterAclAuthorized:
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
      localAccountCreated:
        false,

      aclMutationPerformed:
        false,

      productionKernelEnabled:
        false
    }
  };
}

function aclEvidence() {
  const paths = [
    MACHINE_ROOT,
    AUTH,
    STATE,
    `${STATE}\\locks`,
    `${STATE}\\journals`,
    `${STATE}\\replay`,
    `${STATE}\\audits`,
    `${STATE}\\backups`
  ];

  return {
    model:
      "WINDOWS_DACL_BASELINE_V1",

    directoryCount:
      8,

    fileCount:
      0,

    directories:
      paths.map(
        path => ({
          path,
          exists:
            true,
          isDirectory:
            true,
          reparsePoint:
            false,
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

function capabilities(
  elevated =
    true
) {
  return {
    platform:
      "win32",

    processElevated:
      elevated,

    localAccountsModuleAvailable:
      true,

    commands: {
      "Get-LocalUser":
        true,
      "New-LocalUser":
        true,
      "Disable-LocalUser":
        true,
      "Get-LocalGroup":
        true,
      "Get-LocalGroupMember":
        true,
      "Remove-LocalGroupMember":
        true
    }
  };
}

test(
  "clean elevated host is ready for exact two-account provisioning and ACL activation",
  () => {
    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          capabilities(
            true
          )
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .READY
    );

    assert.equal(
      result.readyForExecutionGate,
      true
    );

    assert.equal(
      result.blockerCount,
      0
    );
  }
);

test(
  "non-elevated host remains ready but requires a new elevated shell for mutation gate",
  () => {
    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          capabilities(
            false
          )
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .READY_ELEVATION_REQUIRED
    );

    assert.equal(
      result.capabilityObservation.newElevatedShellRequired,
      true
    );
  }
);

test(
  "baseline ACL drift blocks identity provisioning before any account or ACL mutation",
  () => {
    const evidence =
      aclEvidence();

    evidence.directories[0]
      .explicitRuleCount =
        4;

    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          evidence,

        capabilityObservation:
          capabilities(
            true
          )
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .BLOCKED_ACL_DRIFT
    );

    assert.equal(
      result.readyForExecutionGate,
      false
    );
  }
);

test(
  "missing local-account provisioning command blocks execution gate",
  () => {
    const cap =
      capabilities(
        true
      );

    cap.commands[
      "New-LocalUser"
    ] =
      false;

    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          cap
      });

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .BLOCKED_CAPABILITY
    );

    assert.deepEqual(
      result.capabilityObservation.missingCommands,
      [
        "New-LocalUser"
      ]
    );
  }
);

test(
  "precheck pins disabled-account ephemeral-password and all-or-nothing rollback semantics",
  () => {
    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          capabilities(
            true
          )
      });

    assert.equal(
      result.provisioningSemantics.createInitiallyDisabled,
      true
    );

    assert.equal(
      result.provisioningSemantics.persistGeneratedAccountPassword,
      false
    );

    assert.equal(
      result.provisioningSemantics.outputGeneratedAccountPassword,
      false
    );

    assert.equal(
      result.provisioningSemantics.allOrNothingRollbackRequired,
      true
    );

    assert.equal(
      result.provisioningSemantics.rollbackMustRemoveAnyNewlyCreatedAccounts,
      true
    );
  }
);

test(
  "ACL delta remains least privilege and exact for inbox versus external state",
  () => {
    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          capabilities(
            true
          )
      });

    assert.equal(
      result.aclActivationSemantics.authorizationInboxAuthorizationDeliveryRights,
      "MODIFY"
    );

    assert.equal(
      result.aclActivationSemantics.authorizationInboxRuntimeRights,
      "READ_EXECUTE"
    );

    assert.equal(
      result.aclActivationSemantics.externalStateAuthorizationDeliveryAccess,
      "NONE"
    );

    assert.equal(
      result.aclActivationSemantics.externalStateRuntimeRights,
      "MODIFY"
    );

    assert.equal(
      result.aclActivationSemantics.externalStateExactTargets.length,
      6
    );
  }
);

test(
  "signer-custody blocker stays open but does not authorize signer use or block identity provisioning",
  () => {
    const result =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
        dayKey:
          DAY,

        remoteHead:
          HEAD,

        sourceR29:
          sourceR29(),

        baselineAclEvidence:
          aclEvidence(),

        capabilityObservation:
          capabilities(
            true
          )
      });

    assert.equal(
      result.signerCustodyBlocker.remainsOpen,
      true
    );

    assert.equal(
      result.signerCustodyBlocker.blocksIdentityProvisioning,
      false
    );

    assert.equal(
      result.signerCustodyBlocker.blocksProductionEnablement,
      true
    );

    assert.equal(
      result.authority.signerUseAuthorized,
      false
    );
  }
);

test(
  "R30 fingerprint is deterministic and runner contains no account ACL signer replay kernel push or deploy mutation machinery",
  () => {
    const args = {
      dayKey:
        DAY,

      remoteHead:
        HEAD,

      sourceR29:
        sourceR29(),

      baselineAclEvidence:
        aclEvidence(),

      capabilityObservation:
        capabilities(
          true
        )
    };

    const first =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck(
        args
      );

    const second =
      buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck(
        args
      );

    assert.equal(
      first.precheckFingerprint,
      second.precheckFingerprint
    );

    assert.equal(
      first.precheckFingerprint,
      checkpointAwareValueComparisonRuntimeIdentitiesAclPrecheckFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_EXECUTION"
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-precheck-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bNew-LocalUser\b/u,
      /\bDisable-LocalUser\b/u,
      /\bRemove-LocalGroupMember\b/u,
      /\bicacls\b/u,
      /\bSet-Acl\b/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bconsumeOnceAtomically\s*\(/u,
      /\bwriteOrAdvanceTransactionJournalAtomically\s*\(/u,
      /\bexecuteAutonomousRepairProductionExecution\s*\(/u,
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
        `R30 runner must not match ${pattern}`
      );
    }
  }
);
