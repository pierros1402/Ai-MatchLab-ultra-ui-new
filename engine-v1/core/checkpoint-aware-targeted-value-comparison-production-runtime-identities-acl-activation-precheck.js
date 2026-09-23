import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-runtime-identities-acl-activation-precheck.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE =
  Object.freeze({
    READY:
      "READY_FOR_EXPLICIT_IDENTITY_PROVISIONING_AND_ACL_ACTIVATION",

    READY_ELEVATION_REQUIRED:
      "READY_FOR_EXPLICIT_IDENTITY_PROVISIONING_AND_ACL_ACTIVATION_IN_NEW_ELEVATED_SHELL",

    BLOCKED_COLLISION:
      "BLOCKED_PREEXISTING_DEDICATED_RUNTIME_IDENTITY_REQUIRES_REVIEW",

    BLOCKED_ACL_DRIFT:
      "BLOCKED_BASELINE_ACL_DRIFT",

    BLOCKED_CAPABILITY:
      "BLOCKED_LOCAL_ACCOUNT_PROVISIONING_CAPABILITY"
  });

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

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

function validateR29Boundary(
  sourceR29,
  dayKey,
  remoteHead
) {
  if (
    !sourceR29 ||
    typeof sourceR29 !==
      "object" ||
    sourceR29.mode !==
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN" ||
    sourceR29.dayKey !==
      dayKey ||
    sourceR29.remoteHead !==
      remoteHead ||
    sourceR29.plan
      ?.state !==
        "DEDICATED_RUNTIME_IDENTITIES_SELECTED_NOT_PROVISIONED" ||
    sourceR29.plan
      ?.readyForIdentityProvisioningPrecheck !==
        true ||
    sourceR29.plan
      ?.operatingSystemPrincipals
      ?.authorizationDeliveryPrincipal
      ?.exists !==
        false ||
    sourceR29.plan
      ?.operatingSystemPrincipals
      ?.controllerRuntimePrincipal
      ?.exists !==
        false ||
    sourceR29.plan
      ?.operatingSystemPrincipals
      ?.authorizationDeliveryPrincipal
      ?.cryptographicSigner !==
        false ||
    sourceR29.plan
      ?.operatingSystemPrincipals
      ?.controllerRuntimePrincipal
      ?.cryptographicSigner !==
        false ||
    sourceR29.plan
      ?.cryptographicIssuer
      ?.signerCustodyRemainsSeparate !==
        true ||
    sourceR29.plan
      ?.securityModel
      ?.privateKeyInRepositoryForbidden !==
        true ||
    sourceR29.plan
      ?.securityModel
      ?.privateKeyInControllerRuntimeRootsForbidden !==
        true ||
    sourceR29.plan
      ?.securityModel
      ?.privateKeyReadByControllerForbidden !==
        true ||
    sourceR29.plan
      ?.securityModel
      ?.privateKeyReadByRuntimeWriterForbidden !==
        true ||
    sourceR29.plan
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK" ||
    sourceR29.plan
      ?.authority
      ?.localAccountCreationAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.localGroupMembershipMutationAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.aclMutationAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.authorizationDeliveryWriteAclAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.productionRuntimeWriterAclAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR29.plan
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR29.safety
      ?.localAccountCreated !==
        false ||
    sourceR29.safety
      ?.aclMutationPerformed !==
        false ||
    sourceR29.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_precheck_r29_boundary_invalid"
    );
  }

  return true;
}

function validateBaselineAclEvidence(
  sourceR29,
  evidence
) {
  if (
    !evidence ||
    typeof evidence !==
      "object" ||
    evidence.model !==
      "WINDOWS_DACL_BASELINE_V1" ||
    evidence.directoryCount !==
      8 ||
    evidence.fileCount !==
      0 ||
    !Array.isArray(
      evidence.directories
    ) ||
    evidence.directories.length !==
      8
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_precheck_acl_evidence_invalid"
    );
  }

  const expectedPaths = [
    sourceR29.plan.machine.machineRoot,
    sourceR29.plan.machine.authorizationInbox,
    sourceR29.plan.machine.externalStateRoot,
    ...sourceR29.plan.aclActivationPlan
      .externalState
      .appliesToRootAndExactChildren
      .map(
        name =>
          name ===
            "external-state"
            ? sourceR29.plan.machine.externalStateRoot
            : `${sourceR29.plan.machine.externalStateRoot}\\${name}`
      )
  ];

  const uniqueExpected =
    [
      ...new Set(
        expectedPaths.map(
          value =>
            clean(
              value
            )
              .toLowerCase()
        )
      )
    ];

  const actual =
    evidence.directories.map(
      row =>
        clean(
          row.path
        )
          .toLowerCase()
    );

  if (
    uniqueExpected.length !==
      8 ||
    new Set(
      actual
    ).size !==
      8 ||
    uniqueExpected.some(
      value =>
        !actual.includes(
          value
        )
    )
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_precheck_acl_path_set_invalid"
    );
  }

  for (
    const row of
      evidence.directories
  ) {
    if (
      row.exists !==
        true ||
      row.isDirectory !==
        true ||
      row.reparsePoint !==
        false ||
      row.accessRulesProtected !==
        true ||
      row.inheritedRuleCount !==
        0 ||
      row.explicitRuleCount !==
        3 ||
      row.systemFullControl !==
        true ||
      row.administratorsFullControl !==
        true ||
      row.controllerReadExecute !==
        true ||
      row.controllerForbiddenWriteRightsPresent !==
        false
    ) {
      throw new Error(
        `value_comparison_runtime_identities_acl_precheck_acl_drift:${row.path}`
      );
    }
  }

  return true;
}

function validateCapabilityObservation(
  observation
) {
  const requiredCommands = [
    "Get-LocalUser",
    "New-LocalUser",
    "Disable-LocalUser",
    "Get-LocalGroup",
    "Get-LocalGroupMember",
    "Remove-LocalGroupMember"
  ];

  if (
    !observation ||
    typeof observation !==
      "object" ||
    observation.platform !==
      "win32" ||
    typeof observation.processElevated !==
      "boolean" ||
    observation.localAccountsModuleAvailable !==
      true ||
    !observation.commands ||
    typeof observation.commands !==
      "object"
  ) {
    return {
      ok:
        false,

      missingCommands:
        requiredCommands
    };
  }

  const missingCommands =
    requiredCommands.filter(
      command =>
        observation.commands[
          command
        ] !==
          true
    );

  return {
    ok:
      missingCommands.length ===
        0,

    missingCommands
  };
}

function coreForFingerprint(
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

    readyForExecutionGate:
      artifact.readyForExecutionGate,

    identityPlan:
      artifact.identityPlan,

    provisioningSemantics:
      artifact.provisioningSemantics,

    aclActivationSemantics:
      artifact.aclActivationSemantics,

    capabilityObservation:
      artifact.capabilityObservation,

    baselineAcl:
      artifact.baselineAcl,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonRuntimeIdentitiesAclPrecheckFingerprint(
  artifact
) {
  return fingerprint(
    coreForFingerprint(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
  dayKey,
  remoteHead,
  sourceR29,
  baselineAclEvidence,
  capabilityObservation
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

  if (
    !DAY_RE.test(
      day
    ) ||
    !HEAD_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_precheck_identity_invalid"
    );
  }

  validateR29Boundary(
    sourceR29,
    day,
    head
  );

  let aclHealthy =
    true;

  try {
    validateBaselineAclEvidence(
      sourceR29,
      baselineAclEvidence
    );
  }
  catch {
    aclHealthy =
      false;
  }

  const capability =
    validateCapabilityObservation(
      capabilityObservation
    );

  const authExists =
    sourceR29.plan
      .operatingSystemPrincipals
      .authorizationDeliveryPrincipal
      .exists ===
        true;

  const runtimeExists =
    sourceR29.plan
      .operatingSystemPrincipals
      .controllerRuntimePrincipal
      .exists ===
        true;

  let state =
    CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
      .READY;

  const blockers = [];

  if (
    authExists ||
    runtimeExists
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .BLOCKED_COLLISION;

    blockers.push(
      "PREEXISTING_DEDICATED_RUNTIME_IDENTITY_REQUIRES_REVIEW"
    );
  }
  else if (
    !aclHealthy
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .BLOCKED_ACL_DRIFT;

    blockers.push(
      "BASELINE_ACL_DRIFT_REQUIRES_REVIEW"
    );
  }
  else if (
    !capability.ok
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .BLOCKED_CAPABILITY;

    blockers.push(
      "LOCAL_ACCOUNT_PROVISIONING_CAPABILITY_MISSING"
    );
  }
  else if (
    capabilityObservation.processElevated !==
      true
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .READY_ELEVATION_REQUIRED;
  }

  const ready =
    [
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .READY,
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_STATE
        .READY_ELEVATION_REQUIRED
    ]
      .includes(
        state
      );

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_PRECHECK_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_runtime_identities_provisioning_and_acl_activation_precheck",

    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK",

    dayKey:
      day,

    remoteHead:
      head,

    state,

    readyForExecutionGate:
      ready,

    identityPlan: {
      authorizationDeliveryAccount:
        sourceR29.plan
          .operatingSystemPrincipals
          .authorizationDeliveryPrincipal
          .account,

      controllerRuntimeAccount:
        sourceR29.plan
          .operatingSystemPrincipals
          .controllerRuntimePrincipal
          .account,

      authorizationDeliveryAccountExists:
        false,

      controllerRuntimeAccountExists:
        false,

      sameSidForbidden:
        true,

      localAdministratorMembershipForbidden:
        true,

      interactiveUseBeforeExecutionHostDesignForbidden:
        true,

      cryptographicSignerRoleForbiddenForBothAccounts:
        true,

      signerCustodyRemainsSeparate:
        true
    },

    provisioningSemantics: {
      exactTwoLocalAccountsOnly:
        true,

      createInitiallyDisabled:
        true,

      initialPasswordMaterial:
        "EPHEMERAL_RANDOM_NOT_PERSISTED_OR_LOGGED",

      persistGeneratedAccountPassword:
        false,

      outputGeneratedAccountPassword:
        false,

      accountSidBindingRequiredImmediatelyAfterCreation:
        true,

      removeUnexpectedLocalGroupMembershipsAfterCreation:
        true,

      localAdministratorsMembershipForbidden:
        true,

      accountEnablementDuringProvisioningForbidden:
        true,

      interactiveLogonEnablementDuringProvisioningForbidden:
        true,

      allOrNothingRollbackRequired:
        true,

      rollbackMustRemoveAnyNewlyCreatedAccounts:
        true
    },

    aclActivationSemantics: {
      preserveSystemFullControl:
        true,

      preserveAdministratorsFullControl:
        true,

      preserveHumanControllerReadExecute:
        true,

      machineRootAuthorizationDeliveryRights:
        "READ_EXECUTE",

      machineRootRuntimeRights:
        "READ_EXECUTE",

      authorizationInboxAuthorizationDeliveryRights:
        "MODIFY",

      authorizationInboxRuntimeRights:
        "READ_EXECUTE",

      externalStateAuthorizationDeliveryAccess:
        "NONE",

      externalStateRuntimeRights:
        "MODIFY",

      externalStateExactTargets:
        [
          sourceR29.plan.machine.externalStateRoot,
          ...sourceR29.plan
            .aclActivationPlan
            .externalState
            .appliesToRootAndExactChildren
            .filter(
              name =>
                name !==
                  "external-state"
            )
            .map(
              name =>
                `${sourceR29.plan.machine.externalStateRoot}\\${name}`
            )
        ],

      inheritanceMustRemainDisabled:
        true,

      unknownAdditionalExplicitAcesForbidden:
        true,

      baselineSddlSnapshotRequiredBeforeMutation:
        true,

      exactSddlRollbackRequiredOnFailure:
        true
    },

    capabilityObservation: {
      localAccountsModuleAvailable:
        capabilityObservation
          ?.localAccountsModuleAvailable ===
            true,

      requiredCommandsPresent:
        capability.ok,

      missingCommands:
        capability.missingCommands,

      processElevated:
        capabilityObservation
          ?.processElevated ===
            true,

      newElevatedShellRequired:
        capabilityObservation
          ?.processElevated !==
            true
    },

    baselineAcl: {
      verified:
        aclHealthy,

      exactDirectoryCount:
        baselineAclEvidence
          ?.directoryCount ??
        null,

      exactFileCount:
        baselineAclEvidence
          ?.fileCount ??
        null,

      expectedExplicitRulesPerDirectory:
        3
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

    signerCustodyBlocker: {
      code:
        "UNATTENDED_SIGNER_CUSTODY_NOT_PRODUCTION_READY",

      remainsOpen:
        true,

      blocksIdentityProvisioning:
        false,

      blocksProductionEnablement:
        true
    },

    requiredNextGate: {
      name:
        ready
        ? "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_EXECUTION"
        : "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_PRECHECK_BLOCKER_RESOLUTION",

      mustRunInElevatedShellOnWindows:
        true,

      mustCreateExactTwoDisabledLocalAccountsOnly:
        true,

      mustPersistNoGeneratedAccountPassword:
        true,

      mustResolveAndPinCreatedSids:
        true,

      mustRemoveUnexpectedLocalGroupMemberships:
        true,

      mustPreserveExactBaselineAclForRollback:
        true,

      mustApplyOnlyPlannedAclDelta:
        true,

      mustRollbackAclAndAccountsOnFailure:
        true,

      mustCreateNoAuthorizationArtifact:
        true,

      mustReadNoPrivateKey:
        true,

      mustUseNoSigner:
        true,

      mustConsumeNoReplay:
        true,

      mustConstructNoProductionAdapter:
        true,

      productionKernelMustRemainDisabled:
        true
    },

    authority: {
      readOnly:
        true,

      precheckOnly:
        true,

      localAccountCreationAuthorized:
        false,

      localAccountEnablementAuthorized:
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

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false
    }
  };

  artifact.precheckFingerprint =
    checkpointAwareValueComparisonRuntimeIdentitiesAclPrecheckFingerprint(
      artifact
    );

  return artifact;
}
