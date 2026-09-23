import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlan,
  checkpointAwareValueComparisonProductionRuntimeIdentitiesAclPlanFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-plan.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const COMPUTER =
  "PIER-LENOVO";

const CONTROLLER =
  "PIER-LENOVO\\pierr";

const CONTROLLER_SID =
  "S-1-5-21-111-222-333-1001";

function sourceR28() {
  return {
    mode:
      "READ_ONLY_PRODUCTION_CONFIGURATION_REAL_ROOT_BINDING_AND_ACL_VERIFICATION",

    dayKey:
      DAY,

    remoteHead:
      HEAD,

    verification: {
      state:
        "PRODUCTION_CONFIGURATION_BOUND_REAL_ROOTS_ACL_VERIFIED_DISABLED",

      productionConfiguration: {
        authorizationInbox:
          "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime\\authorization-inbox",

        externalStateRoot:
          "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime\\external-state",

        productionAdapterEnabled:
          false,

        externalStateWriteAuthorized:
          false
      },

      realRootBinding: {
        bindingMode:
          "PERSISTENT_PRODUCTION",

        adapterConstructionPerformed:
          false,

        externalStateWritePerformed:
          false,

        replayConsumptionPerformed:
          false
      },

      aclVerification: {
        exactDirectoryCount:
          8,

        exactFileCount:
          0,

        reparsePoints:
          0,

        controllerBaselineAccess:
          "READ_EXECUTE_ONLY",

        authorizationInboxExternalIssuerAclConfigured:
          false,

        productionExternalStateRuntimeWriterAclConfigured:
          false
      },

      requiredNextGate: {
        name:
          "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN_READ_ONLY"
      },

      authority: {
        aclMutationAuthorized:
          false,

        authorizationIssuerWriteAclAuthorized:
          false,

        productionRuntimeWriterAclAuthorized:
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

      aclMutationPerformed:
        false,

      productionKernelEnabled:
        false
    }
  };
}

function trustIdentity() {
  return {
    issuerId:
      "ai-matchlab-external-control-plane-v1",

    keyId:
      "arkey_v1_test",

    publicKeySpkiSha256:
      "a".repeat(64),

    privateKeyMaterialPresent:
      false
  };
}

function observation({
  authExists = false,
  runtimeExists = false
} = {}) {
  return {
    computerName:
      COMPUTER,

    authorizationDeliveryAccountName:
      "AIMLAuthAgent",

    runtimeAccountName:
      "AIMLController",

    authorizationDeliveryAccountExists:
      authExists,

    runtimeAccountExists:
      runtimeExists
  };
}

function build(
  value =
    {}
) {
  return buildCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlan({
    dayKey:
      DAY,

    remoteHead:
      HEAD,

    sourceR28:
      sourceR28(),

    trustIdentity:
      trustIdentity(),

    computerName:
      COMPUTER,

    controllerAccount:
      CONTROLLER,

    controllerSid:
      CONTROLLER_SID,

    identityObservation:
      observation(
        value
      )
  });
}

test(
  "clean host selects exact dedicated authorization delivery and controller runtime identities without provisioning them",
  () => {
    const plan =
      build();

    assert.equal(
      plan.state,
      "DEDICATED_RUNTIME_IDENTITIES_SELECTED_NOT_PROVISIONED"
    );

    assert.equal(
      plan.operatingSystemPrincipals.authorizationDeliveryPrincipal.account,
      "PIER-LENOVO\\AIMLAuthAgent"
    );

    assert.equal(
      plan.operatingSystemPrincipals.controllerRuntimePrincipal.account,
      "PIER-LENOVO\\AIMLController"
    );

    assert.equal(
      plan.readyForIdentityProvisioningPrecheck,
      true
    );

    assert.equal(
      plan.authority.localAccountCreationAuthorized,
      false
    );
  }
);

test(
  "authorization delivery principal is explicitly not the cryptographic signer",
  () => {
    const plan =
      build();

    assert.equal(
      plan.cryptographicIssuer.authorizationDeliveryPrincipalIsSigner,
      false
    );

    assert.equal(
      plan.cryptographicIssuer.signerCustodyRemainsSeparate,
      true
    );

    assert.equal(
      plan.operatingSystemPrincipals.authorizationDeliveryPrincipal.cryptographicSigner,
      false
    );

    assert.equal(
      plan.securityModel.privateKeyReadByControllerForbidden,
      true
    );
  }
);

test(
  "ACL plan grants inbox Modify only to delivery identity and ReadExecute only to runtime identity",
  () => {
    const plan =
      build();

    assert.equal(
      plan.aclActivationPlan.authorizationInbox.authorizationDeliveryPrincipal.rights,
      "MODIFY"
    );

    assert.equal(
      plan.aclActivationPlan.authorizationInbox.controllerRuntimePrincipal.rights,
      "READ_EXECUTE"
    );

    assert.equal(
      plan.aclActivationPlan.authorizationInbox.controllerRuntimePrincipal.write,
      false
    );

    assert.equal(
      plan.aclActivationPlan.authorizationInbox.controllerRuntimePrincipal.delete,
      false
    );
  }
);

test(
  "ACL plan grants external-state Modify only to controller runtime and no access to delivery identity",
  () => {
    const plan =
      build();

    assert.equal(
      plan.aclActivationPlan.externalState.controllerRuntimePrincipal.rights,
      "MODIFY"
    );

    assert.equal(
      plan.aclActivationPlan.externalState.controllerRuntimePrincipal.changePermissions,
      false
    );

    assert.equal(
      plan.aclActivationPlan.externalState.controllerRuntimePrincipal.takeOwnership,
      false
    );

    assert.equal(
      plan.aclActivationPlan.externalState.authorizationDeliveryPrincipalAccess,
      "NONE"
    );
  }
);

test(
  "preexisting dedicated identity fails closed into collision review",
  () => {
    const plan =
      build({
        authExists:
          true
      });

    assert.equal(
      plan.state,
      "BLOCKED_PREEXISTING_DEDICATED_RUNTIME_IDENTITY_REQUIRES_REVIEW"
    );

    assert.equal(
      plan.readyForIdentityProvisioningPrecheck,
      false
    );

    assert.equal(
      plan.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITY_COLLISION_REVIEW"
    );
  }
);

test(
  "R28 authority drift fails closed before runtime identity planning",
  () => {
    const bad =
      sourceR28();

    bad.verification.authority
      .productionExternalStateWriteAuthorized =
        true;

    assert.throws(
      () =>
        buildCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlan({
          dayKey:
            DAY,

          remoteHead:
            HEAD,

          sourceR28:
            bad,

          trustIdentity:
            trustIdentity(),

          computerName:
            COMPUTER,

          controllerAccount:
            CONTROLLER,

          controllerSid:
            CONTROLLER_SID,

          identityObservation:
            observation()
        }),
      /r28_boundary_invalid/u
    );
  }
);

test(
  "runtime identity plan fingerprint is deterministic and keeps signer custody blocker explicit",
  () => {
    const first =
      build();

    const second =
      build();

    assert.equal(
      first.planFingerprint,
      second.planFingerprint
    );

    assert.equal(
      first.planFingerprint,
      checkpointAwareValueComparisonProductionRuntimeIdentitiesAclPlanFingerprint(
        first
      )
    );

    assert.equal(
      first.blockers.some(
        row =>
          row.code ===
            "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY"
      ),
      true
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK"
    );
  }
);

test(
  "R29 runner contains no account creation ACL mutation signer private-key adapter replay kernel push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-plan-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bNew-LocalUser\b/u,
      /\bSet-LocalUser\b/u,
      /\bAdd-LocalGroupMember\b/u,
      /\bicacls\b/u,
      /\bSet-Acl\b/u,
      /\bchmodSync\b/u,
      /\bchownSync\b/u,
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreateCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter\s*\(/u,
      /\bexecuteAutonomousRepairProductionExecution\s*\(/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\s*\(/u,
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
      /\bunlinkSync\b/u,
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
        `R29 runner must not match ${pattern}`
      );
    }
  }
);
