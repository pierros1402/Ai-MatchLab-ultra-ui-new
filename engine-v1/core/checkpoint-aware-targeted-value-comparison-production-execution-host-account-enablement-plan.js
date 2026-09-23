import {
  createHash
} from "node:crypto";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_SCHEMA,
  checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint
} from "./checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-post-activation-verification.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-execution-host-account-enablement-plan.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE =
  Object.freeze({
    READY:
      "TASK_SCHEDULER_SELECTED_ACCOUNT_ENABLEMENT_PLANNED_PRODUCTION_DISABLED",

    BLOCKED:
      "BLOCKED_EXECUTION_HOST_OR_ACCOUNT_BASELINE_DRIFT"
  });

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

const SID_RE =
  /^S-\d(?:-\d+)+$/u;

const RELEVANT_LOGON_RIGHTS =
  Object.freeze([
    "SeBatchLogonRight",
    "SeDenyBatchLogonRight",
    "SeServiceLogonRight",
    "SeDenyServiceLogonRight",
    "SeInteractiveLogonRight",
    "SeDenyInteractiveLogonRight",
    "SeRemoteInteractiveLogonRight",
    "SeDenyRemoteInteractiveLogonRight"
  ]);

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

function normalizeSidToken(value) {
  return clean(
    value
  ).replace(
    /^\*/u,
    ""
  );
}

function includesSid(
  values,
  sid
) {
  return values.some(
    value =>
      normalizeSidToken(
        value
      ) === sid
  );
}

function validateSourceR32(
  sourceR32,
  dayKey,
  remoteHead
) {
  const verification =
    sourceR32
      ?.verification;

  if (
    !sourceR32 ||
    typeof sourceR32 !==
      "object" ||
    sourceR32.mode !==
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_VERIFICATION" ||
    sourceR32.dayKey !==
      dayKey ||
    sourceR32.remoteHead !==
      remoteHead ||
    !verification ||
    verification.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_SCHEMA ||
    verification.mode !==
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_VERIFICATION" ||
    verification.dayKey !==
      dayKey ||
    verification.remoteHead !==
      remoteHead ||
    verification.state !==
      "RUNTIME_IDENTITIES_AND_ACL_VERIFIED_PRODUCTION_DISABLED" ||
    verification.verificationFingerprint !==
      checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint(
        verification
      ) ||
    verification.identities
      ?.authorizationDeliveryPrincipal
      ?.exists !==
        true ||
    verification.identities
      ?.authorizationDeliveryPrincipal
      ?.enabled !==
        false ||
    verification.identities
      ?.authorizationDeliveryPrincipal
      ?.localGroupMembershipCount !==
        0 ||
    verification.identities
      ?.authorizationDeliveryPrincipal
      ?.cryptographicSigner !==
        false ||
    verification.identities
      ?.controllerRuntimePrincipal
      ?.exists !==
        true ||
    verification.identities
      ?.controllerRuntimePrincipal
      ?.enabled !==
        false ||
    verification.identities
      ?.controllerRuntimePrincipal
      ?.localGroupMembershipCount !==
        0 ||
    verification.identities
      ?.controllerRuntimePrincipal
      ?.cryptographicSigner !==
        false ||
    verification.identities
      ?.sameSid !==
        false ||
    verification.identities
      ?.localAdministratorMembership !==
        false ||
    verification.acl
      ?.exactDirectoryCount !==
        8 ||
    verification.acl
      ?.exactFileCount !==
        0 ||
    verification.acl
      ?.reparsePointCount !==
        0 ||
    verification.acl
      ?.inheritanceDisabledOnAll !==
        true ||
    verification.acl
      ?.exactAclSetVerified !==
        true ||
    verification.acl
      ?.authorizationInboxAuthorizationDeliveryAccess !==
        "MODIFY" ||
    verification.acl
      ?.authorizationInboxRuntimeAccess !==
        "READ_EXECUTE" ||
    verification.acl
      ?.externalStateAuthorizationDeliveryAccess !==
        "NONE" ||
    verification.acl
      ?.externalStateRuntimeAccess !==
        "MODIFY" ||
    verification.signerCustodyBlocker
      ?.code !==
        "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY" ||
    verification.signerCustodyBlocker
      ?.remainsOpen !==
        true ||
    verification.signerCustodyBlocker
      ?.blocksProductionEnablement !==
        true ||
    verification.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PLAN_READ_ONLY" ||
    verification.authority
      ?.readOnly !==
        true ||
    verification.authority
      ?.localAccountEnablementAuthorized !==
        false ||
    verification.authority
      ?.aclMutationAuthorized !==
        false ||
    verification.authority
      ?.signerUseAuthorized !==
        false ||
    verification.authority
      ?.privateKeyReadAuthorized !==
        false ||
    verification.authority
      ?.productionRealRootAdapterConstructionAuthorized !==
        false ||
    verification.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    verification.authority
      ?.replayConsumptionAuthorized !==
        false ||
    verification.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    verification.authority
      ?.repairExecutionAuthorized !==
        false ||
    verification.authority
      ?.deployAuthorized !==
        false ||
    sourceR32.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR32.safety
      ?.localAccountEnabled !==
        false ||
    sourceR32.safety
      ?.localAccountModified !==
        false ||
    sourceR32.safety
      ?.localGroupMembershipModified !==
        false ||
    sourceR32.safety
      ?.aclMutationPerformed !==
        false ||
    sourceR32.safety
      ?.signerUse !==
        false ||
    sourceR32.safety
      ?.privateKeyRead !==
        false ||
    sourceR32.safety
      ?.replayConsumptionPerformed !==
        false ||
    sourceR32.safety
      ?.productionRealRootAdapterConstructed !==
        false ||
    sourceR32.safety
      ?.productionKernelEnabled !==
        false ||
    sourceR32.safety
      ?.deployPerformed !==
        false
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_r32_boundary_invalid"
    );
  }

  const authSid =
    clean(
      verification.identities
        .authorizationDeliveryPrincipal
        .sid
    );

  const runtimeSid =
    clean(
      verification.identities
        .controllerRuntimePrincipal
        .sid
    );

  if (
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
      "value_comparison_execution_host_plan_r32_identity_sid_invalid"
    );
  }

  return verification;
}

function validateHostObservation(
  observation
) {
  if (
    !observation ||
    typeof observation !==
      "object" ||
    clean(
      observation.taskSchedulerServiceName
    ) !==
      "Schedule" ||
    !clean(
      observation.taskSchedulerState
    ) ||
    !clean(
      observation.taskSchedulerStartMode
    ) ||
    !clean(
      observation.taskSchedulerStartName
    ) ||
    !Number.isInteger(
      observation.controllerExistingTaskCount
    ) ||
    observation.controllerExistingTaskCount <
      0 ||
    !Number.isInteger(
      observation.authorizationDeliveryExistingTaskCount
    ) ||
    observation.authorizationDeliveryExistingTaskCount <
      0 ||
    !Number.isInteger(
      observation.dedicatedAccountServiceCount
    ) ||
    observation.dedicatedAccountServiceCount <
      0
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_host_observation_invalid"
    );
  }
}

function validateAccountObservation(
  observation,
  verification
) {
  const expectedComputer =
    verification.identities
      .computerName;

  const controller =
    observation
      ?.controllerRuntimePrincipal;

  const auth =
    observation
      ?.authorizationDeliveryPrincipal;

  if (
    !observation ||
    typeof observation !==
      "object" ||
    clean(
      observation.computerName
    ).toUpperCase() !==
      clean(
        expectedComputer
      ).toUpperCase() ||
    !controller ||
    !auth ||
    clean(
      controller.account
    ).toLowerCase() !==
      clean(
        verification.identities
          .controllerRuntimePrincipal
          .account
      ).toLowerCase() ||
    clean(
      controller.sid
    ) !==
      verification.identities
        .controllerRuntimePrincipal
        .sid ||
    typeof controller.enabled !==
      "boolean" ||
    typeof controller.passwordRequired !==
      "boolean" ||
    clean(
      auth.account
    ).toLowerCase() !==
      clean(
        verification.identities
          .authorizationDeliveryPrincipal
          .account
      ).toLowerCase() ||
    clean(
      auth.sid
    ) !==
      verification.identities
        .authorizationDeliveryPrincipal
        .sid ||
    typeof auth.enabled !==
      "boolean" ||
    typeof auth.passwordRequired !==
      "boolean"
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_account_observation_invalid"
    );
  }
}

function validateLogonRightsObservation(
  observation
) {
  if (
    !observation ||
    typeof observation !==
      "object"
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_logon_rights_observation_invalid"
    );
  }

  for (
    const right of
      RELEVANT_LOGON_RIGHTS
  ) {
    if (
      !Array.isArray(
        observation[right]
      ) ||
      observation[right].some(
        value =>
          typeof value !==
            "string"
      )
    ) {
      throw new Error(
        "value_comparison_execution_host_plan_logon_rights_observation_invalid"
      );
    }
  }
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

    sourceR32VerificationFingerprint:
      artifact.sourceR32VerificationFingerprint,

    selectedExecutionHost:
      artifact.selectedExecutionHost,

    operatingSystemPrincipals:
      artifact.operatingSystemPrincipals,

    logonRightsPlan:
      artifact.logonRightsPlan,

    credentialCustodyPlan:
      artifact.credentialCustodyPlan,

    accountLifecyclePlan:
      artifact.accountLifecyclePlan,

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

export function checkpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanFingerprint(
  artifact
) {
  return fingerprint(
    planCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlan({
  dayKey,
  remoteHead,
  sourceR32,
  hostObservation,
  accountObservation,
  logonRightsObservation
} = {}) {
  const day =
    clean(
      dayKey
    );

  const head =
    clean(
      remoteHead
    ).toLowerCase();

  if (
    !DAY_RE.test(
      day
    ) ||
    !HEAD_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_identity_invalid"
    );
  }

  const verification =
    validateSourceR32(
      sourceR32,
      day,
      head
    );

  validateHostObservation(
    hostObservation
  );

  validateAccountObservation(
    accountObservation,
    verification
  );

  validateLogonRightsObservation(
    logonRightsObservation
  );

  const controllerSid =
    verification.identities
      .controllerRuntimePrincipal
      .sid;

  const authSid =
    verification.identities
      .authorizationDeliveryPrincipal
      .sid;

  const controllerExistingRights =
    RELEVANT_LOGON_RIGHTS.filter(
      right =>
        includesSid(
          logonRightsObservation[
            right
          ],
          controllerSid
        )
    );

  const authExistingRights =
    RELEVANT_LOGON_RIGHTS.filter(
      right =>
        includesSid(
          logonRightsObservation[
            right
          ],
          authSid
        )
    );

  const baselineIssues = [];

  if (
    clean(
      hostObservation.taskSchedulerState
    ).toUpperCase() !==
      "RUNNING"
  ) {
    baselineIssues.push(
      "TASK_SCHEDULER_NOT_RUNNING"
    );
  }

  if (
    clean(
      hostObservation.taskSchedulerStartMode
    ).toUpperCase() !==
      "AUTO"
  ) {
    baselineIssues.push(
      "TASK_SCHEDULER_NOT_AUTO_START"
    );
  }

  if (
    hostObservation.controllerExistingTaskCount !==
      0 ||
    hostObservation.authorizationDeliveryExistingTaskCount !==
      0
  ) {
    baselineIssues.push(
      "PREEXISTING_DEDICATED_ACCOUNT_SCHEDULED_TASK"
    );
  }

  if (
    hostObservation.dedicatedAccountServiceCount !==
      0
  ) {
    baselineIssues.push(
      "PREEXISTING_DEDICATED_ACCOUNT_WINDOWS_SERVICE"
    );
  }

  if (
    accountObservation
      .controllerRuntimePrincipal
      .enabled !==
        false ||
    accountObservation
      .authorizationDeliveryPrincipal
      .enabled !==
        false
  ) {
    baselineIssues.push(
      "DEDICATED_ACCOUNT_UNEXPECTEDLY_ENABLED"
    );
  }

  if (
    controllerExistingRights.length >
      0
  ) {
    baselineIssues.push(
      "CONTROLLER_PREEXISTING_LOGON_RIGHT_ASSIGNMENT"
    );
  }

  if (
    authExistingRights.length >
      0
  ) {
    baselineIssues.push(
      "AUTHORIZATION_DELIVERY_PREEXISTING_LOGON_RIGHT_ASSIGNMENT"
    );
  }

  const ready =
    baselineIssues.length ===
      0;

  const blockers = [
    ...baselineIssues,
    "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",
    "DEDICATED_NONINTERACTIVE_EXECUTION_HOST_NOT_CONFIGURED",
    "DEDICATED_RUNTIME_ACCOUNTS_REMAIN_DISABLED",
    "CONTROLLER_BATCH_LOGON_RIGHT_NOT_ACTIVATED",
    "CONTROLLER_NONINTERACTIVE_DENY_RIGHTS_NOT_ACTIVATED",
    "CONTROLLER_TASK_CREDENTIAL_NOT_PROVISIONED",
    "CONTROLLER_SCHEDULED_TASK_NOT_REGISTERED",
    "PRODUCTION_REAL_ROOT_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const controllerAccount =
    verification.identities
      .controllerRuntimePrincipal
      .account;

  const authAccount =
    verification.identities
      .authorizationDeliveryPrincipal
      .account;

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_production_execution_host_and_account_enablement_plan",

    mode:
      "READ_ONLY_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PLAN",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      ready
        ? CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE.READY
        : CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE.BLOCKED,

    sourceR32VerificationFingerprint:
      verification.verificationFingerprint,

    selectedExecutionHost: {
      platform:
        "WINDOWS",

      hostType:
        "WINDOWS_TASK_SCHEDULER",

      windowsServiceHostSelected:
        false,

      schedulerServiceName:
        "Schedule",

      schedulerServiceRequiredState:
        "Running",

      schedulerServiceRequiredStartMode:
        "Auto",

      taskPath:
        "\\AI-MatchLab-Ultra\\",

      taskName:
        "ValueComparisonProductionController",

      principal:
        controllerAccount,

      principalSid:
        controllerSid,

      logonType:
        "PASSWORD",

      runLevel:
        "LIMITED",

      interactiveTokenAllowed:
        false,

      s4uSelected:
        false,

      taskMustRemainDisabledUntilLaterProductionActivationGate:
        true,

      existingControllerTaskCount:
        hostObservation.controllerExistingTaskCount,

      existingAuthorizationDeliveryTaskCount:
        hostObservation.authorizationDeliveryExistingTaskCount,

      existingDedicatedServiceCount:
        hostObservation.dedicatedAccountServiceCount
    },

    operatingSystemPrincipals: {
      controllerRuntimePrincipal: {
        account:
          controllerAccount,

        sid:
          controllerSid,

        enabledObserved:
          accountObservation
            .controllerRuntimePrincipal
            .enabled,

        passwordRequiredObserved:
          accountObservation
            .controllerRuntimePrincipal
            .passwordRequired,

        cryptographicSigner:
          false,

        intendedExecutionRole:
          "NONINTERACTIVE_TASK_SCHEDULER_RUNTIME"
      },

      authorizationDeliveryPrincipal: {
        account:
          authAccount,

        sid:
          authSid,

        enabledObserved:
          accountObservation
            .authorizationDeliveryPrincipal
            .enabled,

        passwordRequiredObserved:
          accountObservation
            .authorizationDeliveryPrincipal
            .passwordRequired,

        cryptographicSigner:
          false,

        executionHostSelectedInThisGate:
          false,

        logonRightsMutationPlannedInThisGate:
          false
      },

      separationRequired:
        true,

      sameSidForbidden:
        true
    },

    logonRightsPlan: {
      controllerCurrentRelevantAssignments:
        controllerExistingRights,

      authorizationDeliveryCurrentRelevantAssignments:
        authExistingRights,

      controllerFutureGrantExactly: [
        "SeBatchLogonRight",
        "SeDenyInteractiveLogonRight",
        "SeDenyRemoteInteractiveLogonRight"
      ],

      controllerMustNotGrant: [
        "SeServiceLogonRight",
        "SeInteractiveLogonRight",
        "SeRemoteInteractiveLogonRight"
      ],

      controllerMustNotHaveAtActivation: [
        "SeDenyBatchLogonRight",
        "SeDenyServiceLogonRight"
      ],

      authorizationDeliveryChangesInThisPlan: [],

      accountEnablementBeforeExactRightsVerificationForbidden:
        true,

      windowsServiceLogonRightRequired:
        false
    },

    credentialCustodyPlan: {
      taskLogonType:
        "PASSWORD",

      credentialSourceAtFutureActivation:
        "EXPLICIT_OPERATOR_SUPPLIED_OUT_OF_BAND",

      repositoryGeneratesCredential:
        false,

      repositoryReadsCredential:
        false,

      repositoryPersistsCredential:
        false,

      controllerRuntimeRootMayContainCredential:
        false,

      stdoutMayContainCredential:
        false,

      commandLineArgumentMayContainCredential:
        false,

      environmentVariableMayContainCredential:
        false,

      plaintextTaskDefinitionMayContainCredential:
        false,

      onlyOperatingSystemManagedTaskCredentialPersistencePermitted:
        true,

      authorizationDeliveryCredentialCustodySeparate:
        true,

      cryptographicSignerCredentialCustodySeparate:
        true,

      privateKeyMaterialPermitted:
        false,

      credentialRotationRequiredBeforeFutureEnablement:
        true
    },

    accountLifecyclePlan: {
      controllerMustRemainDisabledDuringThisGate:
        true,

      authorizationDeliveryMustRemainDisabledDuringThisGate:
        true,

      controllerFutureEnablementRequiresExplicitActivationGate:
        true,

      controllerFutureEnablementRequiresFreshCredential:
        true,

      controllerFutureEnablementRequiresExactLogonRights:
        true,

      controllerFutureEnablementRequiresTaskDefinitionPrecheck:
        true,

      taskMustBeRegisteredDisabledFirst:
        true,

      productionKernelMustRemainDisabledAfterAccountEnablement:
        true,

      activationFailureMustRestoreControllerDisabled:
        true,

      activationFailureMustRemoveOnlyNewlyAddedLogonRights:
        true,

      activationFailureMustRemoveOnlyNewlyCreatedScheduledTask:
        true,

      aclMutationDuringAccountEnablementForbidden:
        true
    },

    signerCustodyBlocker: {
      code:
        "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",

      remainsOpen:
        true,

      blocksProductionEnablement:
        true,

      blocksExecutionHostPlanning:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
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

    readyForActivationPrecheck:
      ready,

    requiredNextGate: {
      name:
        ready
        ? "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PRECHECK_READ_ONLY"
        : "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_BASELINE_DRIFT_REVIEW_READ_ONLY",

      mustReobserveTaskSchedulerState:
        true,

      mustReobserveDedicatedAccountStates:
        true,

      mustReobserveExactLogonRights:
        true,

      mustPinExactTaskPathAndName:
        true,

      mustValidateFreshCredentialCustodyWithoutReadingOrPersistingCredential:
        true,

      mustKeepAuthorizationDeliveryPrincipalNonSigner:
        true,

      mustKeepAuthorizationDeliveryPrincipalDisabled:
        true,

      mustKeepPrivateKeyOutsideRepositoryAndControllerRoots:
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

      planningOnly:
        true,

      localAccountEnablementAuthorized:
        false,

      localAccountPasswordMutationAuthorized:
        false,

      logonRightsMutationAuthorized:
        false,

      scheduledTaskRegistrationAuthorized:
        false,

      scheduledTaskEnablementAuthorized:
        false,

      windowsServiceCreationAuthorized:
        false,

      localGroupMembershipMutationAuthorized:
        false,

      aclMutationAuthorized:
        false,

      credentialReadAuthorized:
        false,

      credentialPersistenceAuthorized:
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

  artifact.planFingerprint =
    checkpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanFingerprint(
      artifact
    );

  return artifact;
}
