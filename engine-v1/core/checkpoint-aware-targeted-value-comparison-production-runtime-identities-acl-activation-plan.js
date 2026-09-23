import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_ACL_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-runtime-identities-acl-activation-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

const SHA_RE =
  /^[0-9a-f]{64}$/u;

const ACCOUNT_RE =
  /^[A-Za-z0-9._-]{1,20}$/u;

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

function validateR28Boundary(
  sourceR28,
  dayKey,
  remoteHead
) {
  if (
    !sourceR28 ||
    typeof sourceR28 !==
      "object" ||
    sourceR28.mode !==
      "READ_ONLY_PRODUCTION_CONFIGURATION_REAL_ROOT_BINDING_AND_ACL_VERIFICATION" ||
    sourceR28.dayKey !==
      dayKey ||
    sourceR28.remoteHead !==
      remoteHead ||
    sourceR28.verification
      ?.state !==
        "PRODUCTION_CONFIGURATION_BOUND_REAL_ROOTS_ACL_VERIFIED_DISABLED" ||
    sourceR28.verification
      ?.productionConfiguration
      ?.productionAdapterEnabled !==
        false ||
    sourceR28.verification
      ?.productionConfiguration
      ?.externalStateWriteAuthorized !==
        false ||
    sourceR28.verification
      ?.realRootBinding
      ?.bindingMode !==
        "PERSISTENT_PRODUCTION" ||
    sourceR28.verification
      ?.realRootBinding
      ?.adapterConstructionPerformed !==
        false ||
    sourceR28.verification
      ?.realRootBinding
      ?.externalStateWritePerformed !==
        false ||
    sourceR28.verification
      ?.realRootBinding
      ?.replayConsumptionPerformed !==
        false ||
    sourceR28.verification
      ?.aclVerification
      ?.exactDirectoryCount !==
        8 ||
    sourceR28.verification
      ?.aclVerification
      ?.exactFileCount !==
        0 ||
    sourceR28.verification
      ?.aclVerification
      ?.reparsePoints !==
        0 ||
    sourceR28.verification
      ?.aclVerification
      ?.controllerBaselineAccess !==
        "READ_EXECUTE_ONLY" ||
    sourceR28.verification
      ?.aclVerification
      ?.authorizationInboxExternalIssuerAclConfigured !==
        false ||
    sourceR28.verification
      ?.aclVerification
      ?.productionExternalStateRuntimeWriterAclConfigured !==
        false ||
    sourceR28.verification
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN_READ_ONLY" ||
    sourceR28.verification
      ?.authority
      ?.aclMutationAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.authorizationIssuerWriteAclAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.productionRuntimeWriterAclAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.productionRealRootAdapterConstructionAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR28.verification
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR28.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR28.safety
      ?.aclMutationPerformed !==
        false ||
    sourceR28.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_plan_r28_boundary_invalid"
    );
  }

  return true;
}

function validateTrustIdentity(
  trustIdentity
) {
  if (
    !trustIdentity ||
    typeof trustIdentity !==
      "object" ||
    !clean(
      trustIdentity.issuerId
    ) ||
    !clean(
      trustIdentity.keyId
    ) ||
    !SHA_RE.test(
      clean(
        trustIdentity.publicKeySpkiSha256
      )
    ) ||
    trustIdentity.privateKeyMaterialPresent !==
      false
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_plan_trust_identity_invalid"
    );
  }

  return true;
}

function validateIdentityObservation(
  observation,
  expectedComputerName,
  authAccountName,
  runtimeAccountName
) {
  if (
    !observation ||
    typeof observation !==
      "object" ||
    clean(
      observation.computerName
    )
      .toUpperCase() !==
        expectedComputerName.toUpperCase() ||
    clean(
      observation.authorizationDeliveryAccountName
    ) !==
      authAccountName ||
    clean(
      observation.runtimeAccountName
    ) !==
      runtimeAccountName ||
    typeof observation.authorizationDeliveryAccountExists !==
      "boolean" ||
    typeof observation.runtimeAccountExists !==
      "boolean"
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_plan_identity_observation_invalid"
    );
  }

  return true;
}

function planCore(
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

    machine:
      artifact.machine,

    cryptographicIssuer:
      artifact.cryptographicIssuer,

    operatingSystemPrincipals:
      artifact.operatingSystemPrincipals,

    aclActivationPlan:
      artifact.aclActivationPlan,

    securityModel:
      artifact.securityModel,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionRuntimeIdentitiesAclPlanFingerprint(
  artifact
) {
  return fingerprint(
    planCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlan({
  dayKey,
  remoteHead,
  sourceR28,
  trustIdentity,
  computerName,
  controllerAccount,
  controllerSid,
  identityObservation,
  authorizationDeliveryAccountName =
    "AIMLAuthAgent",
  runtimeAccountName =
    "AIMLController"
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

  const controller =
    clean(
      controllerAccount
    );

  const controllerSidValue =
    clean(
      controllerSid
    );

  const authName =
    clean(
      authorizationDeliveryAccountName
    );

  const runtimeName =
    clean(
      runtimeAccountName
    );

  if (
    !DAY_RE.test(
      day
    ) ||
    !HEAD_RE.test(
      head
    ) ||
    !computer ||
    !controller ||
    !controllerSidValue ||
    !ACCOUNT_RE.test(
      authName
    ) ||
    !ACCOUNT_RE.test(
      runtimeName
    ) ||
    authName.toLowerCase() ===
      runtimeName.toLowerCase()
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_plan_identity_invalid"
    );
  }

  validateR28Boundary(
    sourceR28,
    day,
    head
  );

  validateTrustIdentity(
    trustIdentity
  );

  validateIdentityObservation(
    identityObservation,
    computer,
    authName,
    runtimeName
  );

  const authExists =
    identityObservation
      .authorizationDeliveryAccountExists ===
        true;

  const runtimeExists =
    identityObservation
      .runtimeAccountExists ===
        true;

  const preexisting =
    authExists ||
    runtimeExists;

  const machineRoot =
    sourceR28.verification
      .productionConfiguration
      .authorizationInbox
      .replace(
        /[\\/]+authorization-inbox$/u,
        ""
      );

  const authorizationInbox =
    sourceR28.verification
      .productionConfiguration
      .authorizationInbox;

  const externalState =
    sourceR28.verification
      .productionConfiguration
      .externalStateRoot;

  const state =
    preexisting
      ? "BLOCKED_PREEXISTING_DEDICATED_RUNTIME_IDENTITY_REQUIRES_REVIEW"
      : "DEDICATED_RUNTIME_IDENTITIES_SELECTED_NOT_PROVISIONED";

  const blockers = [
    ...(
      preexisting
        ? [
            "PREEXISTING_DEDICATED_RUNTIME_IDENTITY_REQUIRES_REVIEW"
          ]
        : [
            "DEDICATED_RUNTIME_IDENTITIES_NOT_PROVISIONED"
          ]
    ),

    "DEDICATED_RUNTIME_IDENTITY_SIDS_NOT_BOUND",
    "AUTHORIZATION_INBOX_DELIVERY_WRITE_ACL_NOT_ACTIVATED",
    "PRODUCTION_EXTERNAL_STATE_RUNTIME_WRITE_ACL_NOT_ACTIVATED",
    "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",
    "PRODUCTION_REAL_ROOT_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const authPrincipal =
    `${computer}\\${authName}`;

  const runtimePrincipal =
    `${computer}\\${runtimeName}`;

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_ACL_PLAN_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_production_runtime_identities_and_acl_activation_plan",

    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN",

    dayKey:
      day,

    remoteHead:
      head,

    state,

    machine: {
      computerName:
        computer,

      machineRoot,

      authorizationInbox,

      externalStateRoot:
        externalState,

      existingProvisionedRootCount:
        8,

      existingRuntimeFileCount:
        0
    },

    cryptographicIssuer: {
      issuerId:
        trustIdentity.issuerId,

      keyId:
        trustIdentity.keyId,

      publicKeySpkiSha256:
        trustIdentity.publicKeySpkiSha256,

      privateKeyMaterialPresentInRepository:
        false,

      authorizationDeliveryPrincipalIsSigner:
        false,

      signerCustodyRemainsSeparate:
        true
    },

    operatingSystemPrincipals: {
      currentControllerDiagnosticPrincipal: {
        account:
          controller,

        sid:
          controllerSidValue,

        baselineAccess:
          "READ_EXECUTE_ONLY",

        productionRuntimeWriter:
          false
      },

      authorizationDeliveryPrincipal: {
        accountName:
          authName,

        account:
          authPrincipal,

        exists:
          authExists,

        intendedRole:
          "DELIVER_ALREADY_SIGNED_AUTHORIZATION_ARTIFACTS_ONLY",

        cryptographicSigner:
          false,

        localAdministratorMembershipAllowed:
          false,

        interactiveUseAllowed:
          false
      },

      controllerRuntimePrincipal: {
        accountName:
          runtimeName,

        account:
          runtimePrincipal,

        exists:
          runtimeExists,

        intendedRole:
          "READ_SIGNED_AUTHORIZATION_AND_WRITE_ONLY_EXTERNAL_TRANSACTION_STATE",

        cryptographicSigner:
          false,

        localAdministratorMembershipAllowed:
          false,

        interactiveUseAllowed:
          false
      },

      separationRequired:
        true,

      sameSidForbidden:
        true
    },

    aclActivationPlan: {
      machineRoot: {
        path:
          machineRoot,

        preserveCurrentBaseline:
          true,

        add: [
          {
            principal:
              authPrincipal,

            rights:
              "READ_EXECUTE"
          },
          {
            principal:
              runtimePrincipal,

            rights:
              "READ_EXECUTE"
          }
        ]
      },

      authorizationInbox: {
        path:
          authorizationInbox,

        preserveSystemFullControl:
          true,

        preserveAdministratorsFullControl:
          true,

        preserveControllerReadExecute:
          true,

        authorizationDeliveryPrincipal: {
          principal:
            authPrincipal,

          rights:
            "MODIFY",

          mayCreateAlreadySignedAuthorizationJson:
            true,

          mayReadExistingAuthorizationJson:
            true,

          mayDeleteOrReplaceOwnDeliveryArtifacts:
            true
        },

        controllerRuntimePrincipal: {
          principal:
            runtimePrincipal,

          rights:
            "READ_EXECUTE",

          write:
            false,

          delete:
            false
        }
      },

      externalState: {
        root:
          externalState,

        appliesToRootAndExactChildren: [
          "locks",
          "journals",
          "replay",
          "audits",
          "backups"
        ],

        preserveSystemFullControl:
          true,

        preserveAdministratorsFullControl:
          true,

        preserveControllerReadExecute:
          true,

        controllerRuntimePrincipal: {
          principal:
            runtimePrincipal,

          rights:
            "MODIFY",

          changePermissions:
            false,

          takeOwnership:
            false
        },

        authorizationDeliveryPrincipalAccess:
          "NONE"
      },

      inheritanceMustRemainDisabled:
        true,

      unknownAdditionalExplicitAcesForbidden:
        true
    },

    securityModel: {
      leastPrivilege:
        true,

      dedicatedPrincipals:
        true,

      authorizationDeliverySeparatedFromCryptographicSigning:
        true,

      authorizationDeliverySeparatedFromRuntimeStateWriter:
        true,

      runtimeWriterSeparatedFromHumanDiagnosticPrincipal:
        true,

      privateKeyInRepositoryForbidden:
        true,

      privateKeyInControllerRuntimeRootsForbidden:
        true,

      privateKeyReadByControllerForbidden:
        true,

      privateKeyReadByRuntimeWriterForbidden:
        true,

      productionKernelEnablementDuringIdentityOrAclWorkForbidden:
        true
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

    readyForIdentityProvisioningPrecheck:
      !preexisting,

    requiredNextGate: {
      name:
        !preexisting
        ? "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK"
        : "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITY_COLLISION_REVIEW",

      mustUseExactAccountNames:
        true,

      mustFailClosedIfEitherAccountAppearsBeforeProvisioning:
        true,

      mustResolveAndPinSidsAfterAccountCreation:
        true,

      mustRejectAdministratorMembership:
        true,

      mustKeepAccountsNonInteractiveUntilExecutionHostDesign:
        true,

      mustKeepAuthorizationDeliveryPrincipalNonSigner:
        true,

      mustKeepPrivateKeyOutsideRepositoryAndControllerRoots:
        true,

      mustNotEnableProductionKernel:
        true,

      mustNotConstructProductionAdapter:
        true,

      mustNotConsumeReplay:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

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

      productionRealRootAdapterConstructionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
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

  artifact.planFingerprint =
    checkpointAwareValueComparisonProductionRuntimeIdentitiesAclPlanFingerprint(
      artifact
    );

  return artifact;
}
