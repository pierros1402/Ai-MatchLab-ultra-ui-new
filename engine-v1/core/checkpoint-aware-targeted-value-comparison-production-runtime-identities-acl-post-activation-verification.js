import {
  createHash
} from "node:crypto";
import path from "node:path";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-runtime-identities-acl-post-activation-verification.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

const SID_RE =
  /^S-\d(?:-\d+)+$/u;

const WINDOWS_SYSTEM_SID =
  "S-1-5-18";

const WINDOWS_ADMINISTRATORS_SID =
  "S-1-5-32-544";

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(
        value
      )
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function fingerprint(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}

function normalizedPath(value) {
  const resolved =
    path.resolve(
      clean(
        value
      )
    );

  return process.platform ===
    "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function expectedDirectoryRoles({
  machineRoot,
  authorizationInbox,
  externalStateRoot
}) {
  return [
    {
      role:
        "MACHINE_ROOT",
      path:
        machineRoot,
      explicitRuleCount:
        5,
      authAccess:
        "READ_EXECUTE",
      runtimeAccess:
        "READ_EXECUTE"
    },
    {
      role:
        "AUTHORIZATION_INBOX",
      path:
        authorizationInbox,
      explicitRuleCount:
        5,
      authAccess:
        "MODIFY",
      runtimeAccess:
        "READ_EXECUTE"
    },
    {
      role:
        "EXTERNAL_STATE_ROOT",
      path:
        externalStateRoot,
      explicitRuleCount:
        4,
      authAccess:
        "NONE",
      runtimeAccess:
        "MODIFY"
    },
    ...[
      "locks",
      "journals",
      "replay",
      "audits",
      "backups"
    ]
      .map(
        name => ({
          role:
            `EXTERNAL_STATE_${name.toUpperCase()}`,
          path:
            path.join(
              externalStateRoot,
              name
            ),
          explicitRuleCount:
            4,
          authAccess:
            "NONE",
          runtimeAccess:
            "MODIFY"
        })
      )
  ];
}

function validateIdentityEvidence({
  identityEvidence,
  computerName,
  authorizationDeliveryAccountName,
  controllerRuntimeAccountName,
  expectedAuthorizationDeliverySid,
  expectedControllerRuntimeSid
}) {
  if (
    !identityEvidence ||
    typeof identityEvidence !==
      "object" ||
    clean(
      identityEvidence.computerName
    )
      .toUpperCase() !==
        clean(
          computerName
        )
          .toUpperCase() ||
    !Array.isArray(
      identityEvidence.accounts
    ) ||
    identityEvidence.accounts.length !==
      2
  ) {
    throw new Error(
      "value_comparison_runtime_post_activation_identity_evidence_invalid"
    );
  }

  const expected = [
    {
      role:
        "AUTHORIZATION_DELIVERY",
      accountName:
        authorizationDeliveryAccountName,
      sid:
        expectedAuthorizationDeliverySid
    },
    {
      role:
        "CONTROLLER_RUNTIME",
      accountName:
        controllerRuntimeAccountName,
      sid:
        expectedControllerRuntimeSid
    }
  ];

  for (
    const wanted of
      expected
  ) {
    const matches =
      identityEvidence.accounts.filter(
        row =>
          row.role ===
            wanted.role
      );

    if (
      matches.length !==
        1
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_identity_role_missing:${wanted.role}`
      );
    }

    const row =
      matches[0];

    if (
      row.accountName !==
        wanted.accountName ||
      row.account !==
        `${computerName}\\${wanted.accountName}` ||
      row.sid !==
        wanted.sid ||
      row.exists !==
        true ||
      row.enabled !==
        false ||
      !Array.isArray(
        row.localGroupMemberships
      ) ||
      row.localGroupMemberships.length !==
        0
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_identity_state_invalid:${wanted.role}`
      );
    }
  }

  if (
    expectedAuthorizationDeliverySid ===
      expectedControllerRuntimeSid
  ) {
    throw new Error(
      "value_comparison_runtime_post_activation_identity_sid_separation_invalid"
    );
  }

  return true;
}

function validateAclEvidence({
  aclEvidence,
  machineRoot,
  authorizationInbox,
  externalStateRoot,
  humanControllerSid,
  authorizationDeliverySid,
  controllerRuntimeSid
}) {
  if (
    !aclEvidence ||
    typeof aclEvidence !==
      "object" ||
    aclEvidence.model !==
      "WINDOWS_DACL_RUNTIME_IDENTITY_ACTIVATED_V1" ||
    aclEvidence.directoryCount !==
      8 ||
    aclEvidence.fileCount !==
      0 ||
    !Array.isArray(
      aclEvidence.directories
    ) ||
    aclEvidence.directories.length !==
      8
  ) {
    throw new Error(
      "value_comparison_runtime_post_activation_acl_evidence_invalid"
    );
  }

  const expectedRoles =
    expectedDirectoryRoles({
      machineRoot,
      authorizationInbox,
      externalStateRoot
    });

  for (
    const expected of
      expectedRoles
  ) {
    const matches =
      aclEvidence.directories.filter(
        row =>
          row.role ===
            expected.role
      );

    if (
      matches.length !==
        1
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_acl_role_missing:${expected.role}`
      );
    }

    const row =
      matches[0];

    const requiredSids =
      expected.authAccess ===
        "NONE"
        ? [
            WINDOWS_SYSTEM_SID,
            WINDOWS_ADMINISTRATORS_SID,
            humanControllerSid,
            controllerRuntimeSid
          ]
        : [
            WINDOWS_SYSTEM_SID,
            WINDOWS_ADMINISTRATORS_SID,
            humanControllerSid,
            authorizationDeliverySid,
            controllerRuntimeSid
          ];

    if (
      normalizedPath(
        row.path
      ) !==
        normalizedPath(
          expected.path
        ) ||
      row.exists !==
        true ||
      row.isDirectory !==
        true ||
      row.reparsePoint !==
        false ||
      row.ownerSid !==
        WINDOWS_ADMINISTRATORS_SID ||
      row.accessRulesProtected !==
        true ||
      row.inheritedRuleCount !==
        0 ||
      row.explicitRuleCount !==
        expected.explicitRuleCount ||
      !Array.isArray(
        row.explicitSids
      ) ||
      new Set(
        row.explicitSids
      ).size !==
        expected.explicitRuleCount ||
      requiredSids.some(
        sid =>
          !row.explicitSids.includes(
            sid
          )
      ) ||
      row.explicitSids.some(
        sid =>
          !requiredSids.includes(
            sid
          )
      ) ||
      row.systemFullControl !==
        true ||
      row.administratorsFullControl !==
        true ||
      row.humanControllerReadExecute !==
        true ||
      row.humanControllerForbiddenWriteRightsPresent !==
        false
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_acl_baseline_invalid:${expected.role}`
      );
    }

    if (
      expected.authAccess ===
        "NONE"
    ) {
      if (
        row.authorizationDeliveryAcePresent !==
          false
      ) {
        throw new Error(
          `value_comparison_runtime_post_activation_acl_auth_agent_must_be_absent:${expected.role}`
        );
      }
    }
    else if (
      expected.authAccess ===
        "MODIFY"
    ) {
      if (
        row.authorizationDeliveryAcePresent !==
          true ||
        row.authorizationDeliveryModify !==
          true
      ) {
        throw new Error(
          `value_comparison_runtime_post_activation_acl_auth_agent_modify_missing:${expected.role}`
        );
      }
    }
    else if (
      row.authorizationDeliveryAcePresent !==
        true ||
      row.authorizationDeliveryReadExecute !==
        true ||
      row.authorizationDeliveryForbiddenWriteRightsPresent !==
        false
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_acl_auth_agent_read_only_invalid:${expected.role}`
      );
    }

    if (
      expected.runtimeAccess ===
        "MODIFY"
    ) {
      if (
        row.controllerRuntimeAcePresent !==
          true ||
        row.controllerRuntimeModify !==
          true
      ) {
        throw new Error(
          `value_comparison_runtime_post_activation_acl_runtime_modify_missing:${expected.role}`
        );
      }
    }
    else if (
      row.controllerRuntimeAcePresent !==
        true ||
      row.controllerRuntimeReadExecute !==
        true ||
      row.controllerRuntimeForbiddenWriteRightsPresent !==
        false
    ) {
      throw new Error(
        `value_comparison_runtime_post_activation_acl_runtime_read_only_invalid:${expected.role}`
      );
    }
  }

  return true;
}

function artifactCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    mode:
      artifact.mode,

    dayKey:
      artifact.dayKey,

    remoteHead:
      artifact.remoteHead,

    state:
      artifact.state,

    identities:
      artifact.identities,

    acl:
      artifact.acl,

    signerCustodyBlocker:
      artifact.signerCustodyBlocker,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint(
  artifact
) {
  return fingerprint(
    artifactCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonRuntimeIdentitiesAclPostActivationVerification({
  dayKey,
  remoteHead,
  computerName,
  humanControllerAccount,
  humanControllerSid,
  authorizationDeliveryAccountName,
  controllerRuntimeAccountName,
  expectedAuthorizationDeliverySid,
  expectedControllerRuntimeSid,
  machineRoot,
  authorizationInbox,
  externalStateRoot,
  identityEvidence,
  aclEvidence
} = {}) {
  const day =
    clean(
      dayKey
    );

  const head =
    clean(
      remoteHead
    )
      .toLowerCase();

  const computer =
    clean(
      computerName
    );

  const humanAccount =
    clean(
      humanControllerAccount
    );

  const humanSid =
    clean(
      humanControllerSid
    );

  const authName =
    clean(
      authorizationDeliveryAccountName
    );

  const runtimeName =
    clean(
      controllerRuntimeAccountName
    );

  const authSid =
    clean(
      expectedAuthorizationDeliverySid
    );

  const runtimeSid =
    clean(
      expectedControllerRuntimeSid
    );

  if (
    !DAY_RE.test(
      day
    ) ||
    !HEAD_RE.test(
      head
    ) ||
    !computer ||
    !humanAccount ||
    !SID_RE.test(
      humanSid
    ) ||
    !authName ||
    !runtimeName ||
    !SID_RE.test(
      authSid
    ) ||
    !SID_RE.test(
      runtimeSid
    ) ||
    authSid ===
      runtimeSid
  ) {
    throw new Error(
      "value_comparison_runtime_post_activation_identity_invalid"
    );
  }

  validateIdentityEvidence({
    identityEvidence,
    computerName:
      computer,
    authorizationDeliveryAccountName:
      authName,
    controllerRuntimeAccountName:
      runtimeName,
    expectedAuthorizationDeliverySid:
      authSid,
    expectedControllerRuntimeSid:
      runtimeSid
  });

  validateAclEvidence({
    aclEvidence,
    machineRoot,
    authorizationInbox,
    externalStateRoot,
    humanControllerSid:
      humanSid,
    authorizationDeliverySid:
      authSid,
    controllerRuntimeSid:
      runtimeSid
  });

  const blockers = [
    "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",
    "DEDICATED_NONINTERACTIVE_EXECUTION_HOST_NOT_CONFIGURED",
    "DEDICATED_RUNTIME_ACCOUNTS_REMAIN_DISABLED",
    "PRODUCTION_REAL_ROOT_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_runtime_identities_and_acl_post_activation_verification",

    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_VERIFICATION",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      "RUNTIME_IDENTITIES_AND_ACL_VERIFIED_PRODUCTION_DISABLED",

    identities: {
      computerName:
        computer,

      humanControllerAccount:
        humanAccount,

      humanControllerSid:
        humanSid,

      authorizationDeliveryPrincipal: {
        account:
          `${computer}\\${authName}`,

        sid:
          authSid,

        exists:
          true,

        enabled:
          false,

        localGroupMembershipCount:
          0,

        cryptographicSigner:
          false
      },

      controllerRuntimePrincipal: {
        account:
          `${computer}\\${runtimeName}`,

        sid:
          runtimeSid,

        exists:
          true,

        enabled:
          false,

        localGroupMembershipCount:
          0,

        cryptographicSigner:
          false
      },

      sameSid:
        false,

      localAdministratorMembership:
        false
    },

    acl: {
      machineRoot:
        path.resolve(
          machineRoot
        ),

      authorizationInbox:
        path.resolve(
          authorizationInbox
        ),

      externalStateRoot:
        path.resolve(
          externalStateRoot
        ),

      exactDirectoryCount:
        8,

      exactFileCount:
        0,

      reparsePointCount:
        0,

      inheritanceDisabledOnAll:
        true,

      systemFullControlPreserved:
        true,

      administratorsFullControlPreserved:
        true,

      humanControllerReadExecutePreserved:
        true,

      machineRootAuthorizationDeliveryAccess:
        "READ_EXECUTE",

      machineRootRuntimeAccess:
        "READ_EXECUTE",

      authorizationInboxAuthorizationDeliveryAccess:
        "MODIFY",

      authorizationInboxRuntimeAccess:
        "READ_EXECUTE",

      externalStateAuthorizationDeliveryAccess:
        "NONE",

      externalStateRuntimeAccess:
        "MODIFY",

      exactAclSetVerified:
        true
    },

    signerCustodyBlocker: {
      code:
        "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",

      remainsOpen:
        true,

      blocksProductionEnablement:
        true,

      blocksPostActivationVerification:
        false
    },

    blockers:
      blockers.map(
        code => ({
          code,
          blocking:
            true
        })
      ),

    blockerCount:
      blockers.length,

    requiredNextGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PLAN_READ_ONLY",

      mustKeepAuthorizationDeliveryPrincipalNonSigner:
        true,

      mustKeepPrivateKeyOutsideRepositoryAndControllerRoots:
        true,

      mustChooseNoninteractiveWindowsExecutionHost:
        true,

      mustDefineCredentialCustodyWithoutPersistingGeneratedPasswordsInRepository:
        true,

      mustDefineExactLogonRightsBeforeAccountEnablement:
        true,

      mustKeepProductionKernelDisabled:
        true,

      mustConstructNoProductionAdapter:
        true,

      mustConsumeNoReplay:
        true
    },

    authority: {
      readOnly:
        true,

      verificationOnly:
        true,

      localAccountEnablementAuthorized:
        false,

      localGroupMembershipMutationAuthorized:
        false,

      aclMutationAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      productionRealRootAdapterConstructionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      deployAuthorized:
        false
    }
  };

  artifact.verificationFingerprint =
    checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint(
      artifact
    );

  return artifact;
}
