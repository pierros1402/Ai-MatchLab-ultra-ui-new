import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-disabled-production-readiness.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_STATE =
  Object.freeze({
    DISABLED_PREREQUISITES_INCOMPLETE:
      "DISABLED_PREREQUISITES_INCOMPLETE"
  });

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

const BLOCKERS =
  Object.freeze([
    "EXTERNAL_SIGNED_AUTHORIZATION_INGRESS_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
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

function exactTargetScope(dayKey) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

function validateR19Boundary(
  sourceR19
) {
  if (
    !sourceR19 ||
    typeof sourceR19 !==
      "object" ||
    sourceR19.mode !==
      "EXTERNAL_STATE_REPLAY_JOURNAL_CRASH_RECOVERY_SANDBOX" ||
    ![
      "NO_EXTERNAL_STATE_SANDBOX_REQUIRED_CURRENT_STATE",
      "AWAITING_VERIFIED_TRANSACTION_AND_SOURCE_BOUND_MATERIAL"
    ].includes(
      sourceR19.recoveryState
    ) ||
    sourceR19.implementation
      ?.dedicatedExternalStateSandboxAdapterImplemented !==
        true ||
    sourceR19.implementation
      ?.externalGlobalLockImplemented !==
        true ||
    sourceR19.implementation
      ?.singleUseAtomicReplayConsumptionImplementedInSandbox !==
        true ||
    sourceR19.implementation
      ?.durableJournalStateMachineImplemented !==
        true ||
    sourceR19.implementation
      ?.verifiedExternalBackupImplemented !==
        true ||
    sourceR19.implementation
      ?.crashAfterFirstApplySimulationImplemented !==
        true ||
    sourceR19.implementation
      ?.recoveryClassifiesPreimagePostimageAmbiguous !==
        true ||
    sourceR19.implementation
      ?.reverseRollbackFromDurableJournalImplemented !==
        true ||
    sourceR19.implementation
      ?.terminalAuditImplemented !==
        true ||
    sourceR19.implementation
      ?.ambiguousStateFailsToRecoveryRequired !==
        true ||
    sourceR19.implementation
      ?.replayReleaseAfterFailure !==
        false ||
    sourceR19.implementation
      ?.retryRequiresNewAuthorization !==
        true ||
    sourceR19.implementation
      ?.productionExternalStateAdapterImplemented !==
        false ||
    sourceR19.implementation
      ?.productionKernelAdapterImplemented !==
        false
  ) {
    throw new Error(
      "value_comparison_production_readiness_r19_boundary_invalid"
    );
  }

  if (
    sourceR19.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR19.safety
      ?.replayConsumptionPerformedThisObservation !==
        false ||
    sourceR19.safety
      ?.authorizationArtifactCreated !==
        false ||
    sourceR19.safety
      ?.signerUse !==
        false ||
    sourceR19.safety
      ?.privateKeyRead !==
        false ||
    sourceR19.safety
      ?.productionKernelInvoked !==
        false ||
    sourceR19.safety
      ?.productionKernelEnabled !==
        false ||
    sourceR19.safety
      ?.authorizationGrantAuthority !==
        false ||
    sourceR19.safety
      ?.repairExecutionAuthority !==
        false
  ) {
    throw new Error(
      "value_comparison_production_readiness_r19_safety_invalid"
    );
  }

  return true;
}

function validateLegacyDisabledAdapter(
  legacy
) {
  if (
    !legacy ||
    typeof legacy !==
      "object" ||
    legacy.mode !==
      "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT" ||
    legacy.contract
      ?.route
      ?.dedicatedRepairClass !==
        "REBUILD_VALUE_COMPARISON_ONLY" ||
    legacy.contract
      ?.authority
      ?.adapterEnabled !==
        false ||
    legacy.contract
      ?.authority
      ?.protectedPathBypassAuthorized !==
        false ||
    legacy.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    legacy.contract
      ?.legacyCompatibility
      ?.authorizationV2SupportsDedicatedRepairClass !==
        false ||
    legacy.contract
      ?.legacyCompatibility
      ?.transactionPlanSupportsDedicatedRepairClass !==
        false ||
    legacy.contract
      ?.productionExecutionBoundary
      ?.existingProductionEntrypointCompatible !==
        false ||
    legacy.contract
      ?.productionExecutionBoundary
      ?.existingAuthorizationV2Compatible !==
        false ||
    legacy.contract
      ?.productionExecutionBoundary
      ?.existingTransactionPlanCompatible !==
        false
  ) {
    throw new Error(
      "value_comparison_production_readiness_legacy_boundary_invalid"
    );
  }

  return true;
}

function validateGenericProductionReadiness(
  generic
) {
  if (
    !generic ||
    typeof generic !==
      "object" ||
    generic.pinnedTrustRequired !==
      true ||
    generic.callerSuppliedTrustForbidden !==
      true ||
    generic.callerSuppliedProjectRootForbidden !==
      true ||
    generic.productionKernelEnabled !==
      false ||
    Number(
      generic.trustedKeyCount
    ) <
      1
  ) {
    throw new Error(
      "value_comparison_production_readiness_generic_boundary_invalid"
    );
  }

  return true;
}

export function checkpointAwareValueComparisonProductionReadinessFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_production_readiness_artifact_required"
    );
  }

  const {
    readinessFingerprint:
      _ignored,
    ...unsigned
  } =
    artifact;

  return fingerprint(
    unsigned
  );
}

export function buildCheckpointAwareValueComparisonDisabledProductionReadinessContract({
  dayKey,
  remoteHead,
  sourceR19,
  legacyDisabledAdapter,
  genericProductionReadiness,
  externalAuthorizationIngressImplemented =
    false,
  dedicatedProductionExternalStateAdapterImplemented =
    false,
  dedicatedProductionKernelAdapterImplemented =
    false,
  endToEndProductionOrchestratorImplemented =
    false
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
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_readiness_identity_invalid"
    );
  }

  validateR19Boundary(
    sourceR19
  );

  validateLegacyDisabledAdapter(
    legacyDisabledAdapter
  );

  validateGenericProductionReadiness(
    genericProductionReadiness
  );

  if (
    externalAuthorizationIngressImplemented !==
      false ||
    dedicatedProductionExternalStateAdapterImplemented !==
      false ||
    dedicatedProductionKernelAdapterImplemented !==
      false ||
    endToEndProductionOrchestratorImplemented !==
      false
  ) {
    throw new Error(
      "value_comparison_production_readiness_unreviewed_production_surface_detected"
    );
  }

  if (
    sourceR19.dayKey !==
      day ||
    sourceR19.remoteHead !==
      head ||
    legacyDisabledAdapter.dayKey !==
      day ||
    legacyDisabledAdapter.remoteHead !==
      head
  ) {
    throw new Error(
      "value_comparison_production_readiness_source_binding_mismatch"
    );
  }

  const proposedMutationCount =
    Number(
      sourceR19.proposedMutationCount ||
      0
    );

  if (
    !Number.isInteger(
      proposedMutationCount
    ) ||
    proposedMutationCount <
      0 ||
    proposedMutationCount >
      2
  ) {
    throw new Error(
      "value_comparison_production_readiness_mutation_count_invalid"
    );
  }

  const currentRouteState =
    proposedMutationCount ===
      0
      ? "NO_MUTATION_REQUIRED_CURRENT_STATE"
      : "MUTATION_CANDIDATE_REMAINS_PRODUCTION_DISABLED";

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_SCHEMA,

    version:
      "1.0.0",

    role:
      "disabled_production_adapter_readiness_contract",

    mode:
      "DISABLED_PRODUCTION_ADAPTER_READINESS_CONTRACT",

    dayKey:
      day,

    remoteHead:
      head,

    route: {
      failureClass:
        "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL",

      repairUnit:
        "rebuild_day_value_comparison_and_cumulative_only",

      dedicatedRepairClass:
        "REBUILD_VALUE_COMPARISON_ONLY",

      exactTargetScope:
        exactTargetScope(
          day
        )
    },

    currentState: {
      routeState:
        currentRouteState,

      proposedMutationCount,

      sourceR19RecoveryState:
        sourceR19.recoveryState,

      productionReadinessState:
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_READINESS_STATE
          .DISABLED_PREREQUISITES_INCOMPLETE
    },

    completedDedicatedFoundation: {
      authorizationTransactionSchemaDesigned:
        true,

      authorizationStructureAndBindingValidatorImplemented:
        true,

      pinnedTrustEd25519VerifierImplemented:
        true,

      deterministicReplayKeyAndTransactionPlanImplemented:
        true,

      sourceBoundPostimageMaterialResolverImplemented:
        true,

      dedicatedKernelAdapterSandboxImplemented:
        true,

      externalStateSandboxAdapterImplemented:
        true,

      atomicReplaySandboxImplemented:
        true,

      durableJournalStateMachineImplemented:
        true,

      verifiedExternalBackupImplemented:
        true,

      crashRecoveryRollbackImplemented:
        true
    },

    preservedInvariants: {
      exactTwoTargetUniverseOnly:
        true,

      replaceOnly:
        true,

      externalSignedAuthorizationBoundary:
        true,

      pinnedPublicTrustRequired:
        true,

      callerSuppliedTrustForbidden:
        true,

      callerSuppliedProjectRootForbidden:
        true,

      singleUseReplay:
        true,

      replayReleaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true,

      exactPreimageReverification:
        true,

      sourceBoundPostimageHashAndSizeVerification:
        true,

      verifiedExternalBackup:
        true,

      reverseRollback:
        true,

      ambiguousRecoveryFailsClosed:
        true,

      legacyProtectedPathBypassAuthorized:
        false,

      genericLegacyStackModified:
        false
    },

    missingProductionInterfaces: {
      externalSignedAuthorizationIngress:
        false,

      dedicatedProductionExternalStateAdapter:
        false,

      dedicatedProductionKernelAdapter:
        false,

      endToEndProductionOrchestrator:
        false
    },

    blockers:
      BLOCKERS.map(
        code => ({
          code,
          blocking:
            true
        })
      ),

    blockerCount:
      BLOCKERS.length,

    requiredNextGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT_READ_ONLY",

      mustNotSignInsideRepository:
        true,

      mustNotReadPrivateKey:
        true,

      mustAcceptOnlyAlreadySignedDedicatedAuthorization:
        true,

      mustBindExternalStateRootOutsideRepository:
        true,

      mustForbidCallerSuppliedProjectRoot:
        true,

      mustRemainReadOnly:
        true,

      mustNotEnableProductionKernel:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      productionAdapterEnabled:
        false,

      authorizationIngressAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
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

  artifact.readinessFingerprint =
    checkpointAwareValueComparisonProductionReadinessFingerprint(
      artifact
    );

  return artifact;
}
