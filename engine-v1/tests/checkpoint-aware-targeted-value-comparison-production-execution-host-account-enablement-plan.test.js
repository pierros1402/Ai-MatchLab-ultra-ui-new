import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_SCHEMA,
  checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-post-activation-verification.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE,
  buildCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlan,
  checkpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-production-execution-host-account-enablement-plan.js";

import {
  runCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanDay
} from "../jobs/run-checkpoint-aware-targeted-value-comparison-production-execution-host-account-enablement-plan-day.js";

const DAY =
  "2026-09-23";

const HEAD =
  "cca8a678a9c691f1516ceca8c7d56f2be4d5ea5a";

const COMPUTER =
  "PIER-LENOVO";

const HUMAN_SID =
  "S-1-5-21-1109869902-1357582342-2707915042-1001";

const AUTH_SID =
  "S-1-5-21-1109869902-1357582342-2707915042-1007";

const CONTROLLER_SID =
  "S-1-5-21-1109869902-1357582342-2707915042-1008";

function verificationR32() {
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
      DAY,

    remoteHead:
      HEAD,

    state:
      "RUNTIME_IDENTITIES_AND_ACL_VERIFIED_PRODUCTION_DISABLED",

    identities: {
      computerName:
        COMPUTER,

      humanControllerAccount:
        `${COMPUTER}\\pierr`,

      humanControllerSid:
        HUMAN_SID,

      authorizationDeliveryPrincipal: {
        account:
          `${COMPUTER}\\AIMLAuthAgent`,
        sid:
          AUTH_SID,
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
          `${COMPUTER}\\AIMLController`,
        sid:
          CONTROLLER_SID,
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
        "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime",
      authorizationInbox:
        "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime\\authorization-inbox",
      externalStateRoot:
        "C:\\ProgramData\\AI-MatchLab-Ultra\\ControllerRuntime\\external-state",
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

function sourceR32() {
  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-runtime-identities-acl-post-activation-verification-day.v1",
    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_ACL_POST_ACTIVATION_VERIFICATION",
    dayKey:
      DAY,
    generatedAt:
      "2026-09-23T12:00:00.000Z",
    remoteHead:
      HEAD,
    verification:
      verificationR32(),
    safety: {
      repositoryWritePerformed:
        false,
      localAccountCreated:
        false,
      localAccountEnabled:
        false,
      localAccountModified:
        false,
      localGroupMembershipModified:
        false,
      aclMutationPerformed:
        false,
      authorizationArtifactCreated:
        false,
      replayConsumptionPerformed:
        false,
      productionRealRootAdapterConstructed:
        false,
      signerUse:
        false,
      privateKeyRead:
        false,
      productionKernelInvoked:
        false,
      productionKernelEnabled:
        false,
      repairExecutionAuthority:
        false,
      commitPerformed:
        false,
      pushPerformed:
        false,
      deployPerformed:
        false
    }
  };
}

function hostObservation() {
  return {
    taskSchedulerServiceName:
      "Schedule",
    taskSchedulerState:
      "Running",
    taskSchedulerStartMode:
      "Auto",
    taskSchedulerStartName:
      "LocalSystem",
    controllerExistingTaskCount:
      0,
    authorizationDeliveryExistingTaskCount:
      0,
    dedicatedAccountServiceCount:
      0
  };
}

function accountObservation() {
  return {
    computerName:
      COMPUTER,
    controllerRuntimePrincipal: {
      account:
        `${COMPUTER}\\AIMLController`,
      sid:
        CONTROLLER_SID,
      enabled:
        false,
      passwordRequired:
        false
    },
    authorizationDeliveryPrincipal: {
      account:
        `${COMPUTER}\\AIMLAuthAgent`,
      sid:
        AUTH_SID,
      enabled:
        false,
      passwordRequired:
        false
    }
  };
}

function logonRightsObservation() {
  return {
    SeBatchLogonRight: [
      "*S-1-5-32-544",
      "*S-1-5-32-551",
      "*S-1-5-32-559"
    ],
    SeDenyBatchLogonRight: [],
    SeServiceLogonRight: [
      "*S-1-5-80-0",
      "*S-1-5-83-0"
    ],
    SeDenyServiceLogonRight: [],
    SeInteractiveLogonRight: [
      "Guest",
      "*S-1-5-32-544",
      "*S-1-5-32-545",
      "*S-1-5-32-551"
    ],
    SeDenyInteractiveLogonRight: [
      "Guest"
    ],
    SeRemoteInteractiveLogonRight: [
      "*S-1-5-32-544",
      "*S-1-5-32-555"
    ],
    SeDenyRemoteInteractiveLogonRight: []
  };
}

function build(overrides = {}) {
  return buildCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlan({
    dayKey:
      DAY,
    remoteHead:
      HEAD,
    sourceR32:
      sourceR32(),
    hostObservation:
      hostObservation(),
    accountObservation:
      accountObservation(),
    logonRightsObservation:
      logonRightsObservation(),
    ...overrides
  });
}

test(
  "R33 selects Windows Task Scheduler for AIMLController while production remains disabled",
  () => {
    const result =
      build();

    assert.equal(
      result.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE.READY
    );
    assert.equal(
      result.selectedExecutionHost.hostType,
      "WINDOWS_TASK_SCHEDULER"
    );
    assert.equal(
      result.selectedExecutionHost.principal,
      `${COMPUTER}\\AIMLController`
    );
    assert.equal(
      result.selectedExecutionHost.logonType,
      "PASSWORD"
    );
    assert.equal(
      result.selectedExecutionHost.runLevel,
      "LIMITED"
    );
    assert.equal(
      result.selectedExecutionHost.taskMustRemainDisabledUntilLaterProductionActivationGate,
      true
    );
    assert.equal(
      result.readyForActivationPrecheck,
      true
    );
  }
);

test(
  "R33 binds to the exact untampered R32 verification fingerprint",
  () => {
    const source =
      sourceR32();

    source.verification.acl.externalStateRuntimeAccess =
      "READ_EXECUTE";

    assert.throws(
      () =>
        build({
          sourceR32:
            source
        }),
      /r32_boundary_invalid/u
    );
  }
);

test(
  "R33 rejects R32 authority drift toward production enablement",
  () => {
    const source =
      sourceR32();

    source.verification.authority.productionKernelInvocationAuthorized =
      true;

    source.verification.verificationFingerprint =
      checkpointAwareValueComparisonRuntimeIdentitiesAclPostActivationFingerprint(
        source.verification
      );

    assert.throws(
      () =>
        build({
          sourceR32:
            source
        }),
      /r32_boundary_invalid/u
    );
  }
);

test(
  "R33 keeps both dedicated identities disabled and AuthAgent separate from signer custody",
  () => {
    const result =
      build();

    assert.equal(
      result.operatingSystemPrincipals.controllerRuntimePrincipal.enabledObserved,
      false
    );
    assert.equal(
      result.operatingSystemPrincipals.authorizationDeliveryPrincipal.enabledObserved,
      false
    );
    assert.equal(
      result.operatingSystemPrincipals.authorizationDeliveryPrincipal.cryptographicSigner,
      false
    );
    assert.equal(
      result.signerCustodyBlocker.remainsOpen,
      true
    );
    assert.equal(
      result.signerCustodyBlocker.blocksProductionEnablement,
      true
    );
  }
);

test(
  "preexisting AIML task or Windows service blocks the activation-precheck handoff",
  () => {
    const taskHost =
      hostObservation();
    taskHost.controllerExistingTaskCount =
      1;

    const taskResult =
      build({
        hostObservation:
          taskHost
      });

    assert.equal(
      taskResult.state,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_ACCOUNT_ENABLEMENT_PLAN_STATE.BLOCKED
    );

    const serviceHost =
      hostObservation();
    serviceHost.dedicatedAccountServiceCount =
      1;

    const serviceResult =
      build({
        hostObservation:
          serviceHost
      });

    assert.equal(
      serviceResult.readyForActivationPrecheck,
      false
    );
  }
);

test(
  "Task Scheduler must be running and automatic",
  () => {
    const host =
      hostObservation();
    host.taskSchedulerState =
      "Stopped";
    host.taskSchedulerStartMode =
      "Manual";

    const result =
      build({
        hostObservation:
          host
      });

    const codes =
      result.blockers.map(
        blocker =>
          blocker.code
      );

    assert.equal(
      codes.includes(
        "TASK_SCHEDULER_NOT_RUNNING"
      ),
      true
    );
    assert.equal(
      codes.includes(
        "TASK_SCHEDULER_NOT_AUTO_START"
      ),
      true
    );
  }
);

test(
  "preexisting dedicated-account logon rights fail closed as baseline drift",
  () => {
    const rights =
      logonRightsObservation();
    rights.SeBatchLogonRight.push(
      `*${CONTROLLER_SID}`
    );

    const result =
      build({
        logonRightsObservation:
          rights
      });

    assert.equal(
      result.readyForActivationPrecheck,
      false
    );
    assert.equal(
      result.logonRightsPlan.controllerCurrentRelevantAssignments.includes(
        "SeBatchLogonRight"
      ),
      true
    );
  }
);

test(
  "logon-right plan is exact for batch execution and explicit noninteractive denial",
  () => {
    const result =
      build();

    assert.deepEqual(
      result.logonRightsPlan.controllerFutureGrantExactly,
      [
        "SeBatchLogonRight",
        "SeDenyInteractiveLogonRight",
        "SeDenyRemoteInteractiveLogonRight"
      ]
    );

    assert.deepEqual(
      result.logonRightsPlan.controllerMustNotGrant,
      [
        "SeServiceLogonRight",
        "SeInteractiveLogonRight",
        "SeRemoteInteractiveLogonRight"
      ]
    );

    assert.equal(
      result.logonRightsPlan.windowsServiceLogonRightRequired,
      false
    );
  }
);

test(
  "credential custody is OS-bound and forbids repository runtime stdout CLI env and private-key persistence",
  () => {
    const plan =
      build().credentialCustodyPlan;

    assert.equal(
      plan.repositoryGeneratesCredential,
      false
    );
    assert.equal(
      plan.repositoryReadsCredential,
      false
    );
    assert.equal(
      plan.repositoryPersistsCredential,
      false
    );
    assert.equal(
      plan.controllerRuntimeRootMayContainCredential,
      false
    );
    assert.equal(
      plan.stdoutMayContainCredential,
      false
    );
    assert.equal(
      plan.commandLineArgumentMayContainCredential,
      false
    );
    assert.equal(
      plan.environmentVariableMayContainCredential,
      false
    );
    assert.equal(
      plan.privateKeyMaterialPermitted,
      false
    );
    assert.equal(
      plan.cryptographicSignerCredentialCustodySeparate,
      true
    );
  }
);

test(
  "R33 grants no account task rights credential adapter replay kernel repair push or deploy authority",
  () => {
    const authority =
      build().authority;

    for (
      const value of
        Object.values(
          authority
        )
    ) {
      if (
        value === true
      ) {
        assert.equal(
          value,
          authority.readOnly ||
            authority.planningOnly
        );
      }
    }

    assert.equal(
      authority.readOnly,
      true
    );
    assert.equal(
      authority.planningOnly,
      true
    );
    assert.equal(
      authority.localAccountEnablementAuthorized,
      false
    );
    assert.equal(
      authority.logonRightsMutationAuthorized,
      false
    );
    assert.equal(
      authority.scheduledTaskRegistrationAuthorized,
      false
    );
    assert.equal(
      authority.credentialReadAuthorized,
      false
    );
    assert.equal(
      authority.signerUseAuthorized,
      false
    );
    assert.equal(
      authority.privateKeyReadAuthorized,
      false
    );
    assert.equal(
      authority.productionKernelInvocationAuthorized,
      false
    );
    assert.equal(
      authority.deployAuthorized,
      false
    );
  }
);

test(
  "R33 fingerprint is deterministic and next gate is read-only activation precheck",
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
      checkpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanFingerprint(
        first
      )
    );
    assert.equal(
      first.requiredNextGate.name,
      "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PRECHECK_READ_ONLY"
    );
  }
);

test(
  "R33 day runner is planning-only and contains no Windows or production mutation machinery",
  () => {
    const result =
      runCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanDay({
        dayKey:
          DAY,
        remoteHead:
          HEAD,
        sourceR32:
          sourceR32(),
        hostObservation:
          hostObservation(),
        accountObservation:
          accountObservation(),
        logonRightsObservation:
          logonRightsObservation(),
        generatedAt:
          "2026-09-23T12:30:00.000Z"
      });

    assert.equal(
      result.plan.readyForActivationPrecheck,
      true
    );
    assert.equal(
      result.safety.localAccountEnabled,
      false
    );
    assert.equal(
      result.safety.logonRightsModified,
      false
    );
    assert.equal(
      result.safety.scheduledTaskRegistered,
      false
    );
    assert.equal(
      result.safety.credentialRead,
      false
    );
    assert.equal(
      result.safety.signerUse,
      false
    );
    assert.equal(
      result.safety.privateKeyRead,
      false
    );
    assert.equal(
      result.safety.productionKernelEnabled,
      false
    );
    assert.equal(
      result.safety.deployPerformed,
      false
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-production-execution-host-account-enablement-plan-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bEnable-LocalUser\b/u,
      /\bSet-LocalUser\b/u,
      /\bNew-LocalUser\b/u,
      /\bRegister-ScheduledTask\b/u,
      /\bNew-ScheduledTask\b/u,
      /\bschtasks(?:\.exe)?\b/u,
      /\bNew-Service\b/u,
      /\bsecedit(?:\.exe)?\s+\/configure\b/u,
      /\bwriteFileSync\b/u,
      /\brenameSync\b/u,
      /\bunlinkSync\b/u,
      /\bconsumeOnceAtomically\s*\(/u,
      /\bcreatePrivateKey\b/u,
      /\bsign\s*\(/u,
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
        `R33 runner must not match ${pattern}`
      );
    }
  }
);
