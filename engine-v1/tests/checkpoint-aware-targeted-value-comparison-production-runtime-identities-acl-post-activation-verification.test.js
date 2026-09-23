import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareValueComparisonRuntimeIdentitiesAclPostActivationVerification,
  checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-post-activation-verification.js";

const DAY =
  "2026-09-23";

const HEAD =
  "8".repeat(40);

const COMPUTER =
  "PIER-LENOVO";

const HUMAN_ACCOUNT =
  "PIER-LENOVO\\pierr";

const HUMAN_SID =
  "S-1-5-21-1-2-3-1001";

const AUTH_NAME =
  "AIMLAuthAgent";

const AUTH_SID =
  "S-1-5-21-1-2-3-1007";

const RUNTIME_NAME =
  "AIMLController";

const RUNTIME_SID =
  "S-1-5-21-1-2-3-1008";

const ROOT =
  "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime";

const INBOX =
  `${ROOT}\\authorization-inbox`;

const STATE =
  `${ROOT}\\external-state`;

function identityEvidence() {
  return {
    computerName:
      COMPUTER,

    accounts: [
      {
        role:
          "AUTHORIZATION_DELIVERY",

        accountName:
          AUTH_NAME,

        account:
          `${COMPUTER}\\${AUTH_NAME}`,

        sid:
          AUTH_SID,

        exists:
          true,

        enabled:
          false,

        localGroupMemberships: []
      },
      {
        role:
          "CONTROLLER_RUNTIME",

        accountName:
          RUNTIME_NAME,

        account:
          `${COMPUTER}\\${RUNTIME_NAME}`,

        sid:
          RUNTIME_SID,

        exists:
          true,

        enabled:
          false,

        localGroupMemberships: []
      }
    ]
  };
}

function directoryRows() {
  const stateRows = [
    STATE,
    `${STATE}\\locks`,
    `${STATE}\\journals`,
    `${STATE}\\replay`,
    `${STATE}\\audits`,
    `${STATE}\\backups`
  ];

  return [
    {
      role:
        "MACHINE_ROOT",
      path:
        ROOT,
      explicitRuleCount:
        5,
      explicitSids: [
        "S-1-5-18",
        "S-1-5-32-544",
        HUMAN_SID,
        AUTH_SID,
        RUNTIME_SID
      ],
      authorizationDeliveryAcePresent:
        true,
      authorizationDeliveryReadExecute:
        true,
      authorizationDeliveryModify:
        false,
      authorizationDeliveryForbiddenWriteRightsPresent:
        false,
      controllerRuntimeAcePresent:
        true,
      controllerRuntimeReadExecute:
        true,
      controllerRuntimeModify:
        false,
      controllerRuntimeForbiddenWriteRightsPresent:
        false
    },
    {
      role:
        "AUTHORIZATION_INBOX",
      path:
        INBOX,
      explicitRuleCount:
        5,
      explicitSids: [
        "S-1-5-18",
        "S-1-5-32-544",
        HUMAN_SID,
        AUTH_SID,
        RUNTIME_SID
      ],
      authorizationDeliveryAcePresent:
        true,
      authorizationDeliveryReadExecute:
        true,
      authorizationDeliveryModify:
        true,
      authorizationDeliveryForbiddenWriteRightsPresent:
        true,
      controllerRuntimeAcePresent:
        true,
      controllerRuntimeReadExecute:
        true,
      controllerRuntimeModify:
        false,
      controllerRuntimeForbiddenWriteRightsPresent:
        false
    },
    ...stateRows.map(
      (
        value,
        index
      ) => ({
        role:
          index ===
            0
            ? "EXTERNAL_STATE_ROOT"
            : `EXTERNAL_STATE_${[
                "LOCKS",
                "JOURNALS",
                "REPLAY",
                "AUDITS",
                "BACKUPS"
              ][
                index -
                1
              ]}`,
        path:
          value,
        explicitRuleCount:
          4,
        explicitSids: [
          "S-1-5-18",
          "S-1-5-32-544",
          HUMAN_SID,
          RUNTIME_SID
        ],
        authorizationDeliveryAcePresent:
          false,
        authorizationDeliveryReadExecute:
          false,
        authorizationDeliveryModify:
          false,
        authorizationDeliveryForbiddenWriteRightsPresent:
          false,
        controllerRuntimeAcePresent:
          true,
        controllerRuntimeReadExecute:
          true,
        controllerRuntimeModify:
          true,
        controllerRuntimeForbiddenWriteRightsPresent:
          true
      })
    )
  ]
    .map(
      row => ({
        ...row,
        exists:
          true,
        isDirectory:
          true,
        reparsePoint:
          false,
        ownerSid:
          "S-1-5-32-544",
        accessRulesProtected:
          true,
        inheritedRuleCount:
          0,
        systemFullControl:
          true,
        administratorsFullControl:
          true,
        humanControllerReadExecute:
          true,
        humanControllerForbiddenWriteRightsPresent:
          false
      })
    );
}

function aclEvidence() {
  return {
    model:
      "WINDOWS_DACL_RUNTIME_IDENTITY_ACTIVATED_V1",

    directoryCount:
      8,

    fileCount:
      0,

    directories:
      directoryRows()
  };
}

function build(
  identity =
    identityEvidence(),
  acl =
    aclEvidence()
) {
  return buildCheckpointAwareValueComparisonRuntimeIdentitiesAclPostActivationVerification({
    dayKey:
      DAY,

    remoteHead:
      HEAD,

    computerName:
      COMPUTER,

    humanControllerAccount:
      HUMAN_ACCOUNT,

    humanControllerSid:
      HUMAN_SID,

    authorizationDeliveryAccountName:
      AUTH_NAME,

    controllerRuntimeAccountName:
      RUNTIME_NAME,

    expectedAuthorizationDeliverySid:
      AUTH_SID,

    expectedControllerRuntimeSid:
      RUNTIME_SID,

    machineRoot:
      ROOT,

    authorizationInbox:
      INBOX,

    externalStateRoot:
      STATE,

    identityEvidence:
      identity,

    aclEvidence:
      acl
  });
}

test(
  "exact R31 identities and ACL activation verify while production remains disabled",
  () => {
    const result =
      build();

    assert.equal(
      result.state,
      "RUNTIME_IDENTITIES_AND_ACL_VERIFIED_PRODUCTION_DISABLED"
    );

    assert.equal(
      result.identities.authorizationDeliveryPrincipal.enabled,
      false
    );

    assert.equal(
      result.identities.controllerRuntimePrincipal.enabled,
      false
    );

    assert.equal(
      result.acl.exactAclSetVerified,
      true
    );

    assert.equal(
      result.authority.productionKernelInvocationAuthorized,
      false
    );
  }
);

test(
  "authorization-delivery or runtime SID drift fails closed",
  () => {
    const identity =
      identityEvidence();

    identity.accounts[0].sid =
      "S-1-5-21-1-2-3-2007";

    assert.throws(
      () =>
        build(
          identity
        ),
      /identity_state_invalid/u
    );
  }
);

test(
  "enabled runtime identity fails closed before execution-host planning",
  () => {
    const identity =
      identityEvidence();

    identity.accounts[1].enabled =
      true;

    assert.throws(
      () =>
        build(
          identity
        ),
      /identity_state_invalid/u
    );
  }
);

test(
  "unexpected local group membership fails closed",
  () => {
    const identity =
      identityEvidence();

    identity.accounts[0]
      .localGroupMemberships
      .push(
        "Users"
      );

    assert.throws(
      () =>
        build(
          identity
        ),
      /identity_state_invalid/u
    );
  }
);

test(
  "machine-root explicit ACL set drift fails closed",
  () => {
    const acl =
      aclEvidence();

    acl.directories[0]
      .explicitSids
      .push(
        "S-1-5-32-545"
      );

    acl.directories[0]
      .explicitRuleCount =
        6;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          acl
        ),
      /acl_baseline_invalid/u
    );
  }
);

test(
  "authorization inbox requires AuthAgent modify and runtime read-execute only",
  () => {
    const acl =
      aclEvidence();

    acl.directories[1]
      .authorizationDeliveryModify =
        false;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          acl
        ),
      /auth_agent_modify_missing/u
    );

    const acl2 =
      aclEvidence();

    acl2.directories[1]
      .controllerRuntimeForbiddenWriteRightsPresent =
        true;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          acl2
        ),
      /runtime_read_only_invalid/u
    );
  }
);

test(
  "external state forbids AuthAgent ACE and requires runtime modify",
  () => {
    const acl =
      aclEvidence();

    acl.directories[2]
      .authorizationDeliveryAcePresent =
        true;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          acl
        ),
      /auth_agent_must_be_absent/u
    );

    const acl2 =
      aclEvidence();

    acl2.directories[2]
      .controllerRuntimeModify =
        false;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          acl2
        ),
      /runtime_modify_missing/u
    );
  }
);

test(
  "unexpected files or reparse point evidence fails closed",
  () => {
    const files =
      aclEvidence();

    files.fileCount =
      1;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          files
        ),
      /acl_evidence_invalid/u
    );

    const reparse =
      aclEvidence();

    reparse.directories[7]
      .reparsePoint =
        true;

    assert.throws(
      () =>
        build(
          identityEvidence(),
          reparse
        ),
      /acl_baseline_invalid/u
    );
  }
);

test(
  "R32 fingerprint is deterministic and runner contains no account ACL replay signer kernel push or deploy mutation machinery",
  () => {
    const first =
      build();

    const second =
      build();

    assert.equal(
      first.verificationFingerprint,
      second.verificationFingerprint
    );

    assert.equal(
      first.verificationFingerprint,
      checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint(
        first
      )
    );

    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PLAN_READ_ONLY"
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-post-activation-verification-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bNew-LocalUser\b/u,
      /\bEnable-LocalUser\b/u,
      /\bDisable-LocalUser\b/u,
      /\bAdd-LocalGroupMember\b/u,
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
        `R32 runner must not match ${pattern}`
      );
    }
  }
);
