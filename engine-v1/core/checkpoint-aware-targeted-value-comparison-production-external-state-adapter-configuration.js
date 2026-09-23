import {
  createHash
} from "node:crypto";

import {
  validateCheckpointAwareValueComparisonProductionConfiguration
} from "./checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-adapter-configuration.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS =
  Object.freeze([
    "acquireGlobalExecutionLockAtomically",
    "readGlobalExecutionLock",
    "releaseGlobalExecutionLock",
    "readTransactionJournal",
    "listTransactionJournals",
    "writeOrAdvanceTransactionJournalAtomically",
    "consumeOnceAtomically",
    "readReplayConsumption",
    "writeVerifiedBackupExclusive",
    "readVerifiedBackup",
    "readExecutionAudit",
    "writeExecutionAuditAtomically",
    "inspectRecoveryObligations"
  ]);

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

function validateR21Boundary(
  sourceR21,
  dayKey,
  remoteHead
) {
  if (
    !sourceR21 ||
    typeof sourceR21 !==
      "object" ||
    sourceR21.mode !==
      "READ_ONLY_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT" ||
    sourceR21.dayKey !==
      dayKey ||
    sourceR21.remoteHead !==
      remoteHead ||
    sourceR21.contract
      ?.state !==
        "INGRESS_IMPLEMENTED_CONFIGURATION_NOT_BOUND_DISABLED" ||
    sourceR21.contract
      ?.implementation
      ?.externalSignedAuthorizationIngressReadOnlyImplemented !==
        true ||
    sourceR21.contract
      ?.implementation
      ?.alreadySignedDedicatedAuthorizationOnly !==
        true ||
    sourceR21.contract
      ?.implementation
      ?.productionConfigurationValidatorImplemented !==
        true ||
    sourceR21.contract
      ?.implementation
      ?.productionExternalStateAdapterImplemented !==
        false ||
    sourceR21.contract
      ?.implementation
      ?.productionKernelAdapterImplemented !==
        false ||
    sourceR21.contract
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT_READ_ONLY" ||
    sourceR21.contract
      ?.authority
      ?.productionAdapterEnabled !==
        false ||
    sourceR21.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR21.contract
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR21.contract
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR21.contract
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR21.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR21.contract
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR21.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR21.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_production_external_state_configuration_r21_boundary_invalid"
    );
  }

  return true;
}

function semanticCore(
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

    implementation:
      artifact.implementation,

    productionConfiguration:
      artifact.productionConfiguration,

    requiredMethodSurface:
      artifact.requiredMethodSurface,

    preservedR19Semantics:
      artifact.preservedR19Semantics,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionExternalStateConfigurationFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_production_external_state_configuration_artifact_required"
    );
  }

  return fingerprint(
    semanticCore(
      artifact
    )
  );
}

export function validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape(
  adapter
) {
  if (
    !adapter ||
    typeof adapter !==
      "object" ||
    Array.isArray(
      adapter
    )
  ) {
    throw new Error(
      "value_comparison_production_external_state_adapter_shape_invalid"
    );
  }

  const missing =
    CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      .filter(
        method =>
          typeof adapter[
            method
          ] !==
            "function"
      );

  if (
    missing.length >
      0
  ) {
    throw new Error(
      `value_comparison_production_external_state_adapter_methods_missing:${missing.join(",")}`
    );
  }

  return true;
}

export function buildCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationContract({
  dayKey,
  remoteHead,
  sourceR21,
  productionConfiguration =
    null,
  productionExternalStateAdapterImplemented =
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
    !HEAD_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_external_state_configuration_identity_invalid"
    );
  }

  validateR21Boundary(
    sourceR21,
    day,
    head
  );

  if (
    productionExternalStateAdapterImplemented !==
      false
  ) {
    throw new Error(
      "value_comparison_production_external_state_configuration_unreviewed_adapter_activation"
    );
  }

  let configurationState =
    "NOT_BOUND";

  let configurationFingerprint =
    null;

  let externalStateRoot =
    null;

  if (
    productionConfiguration !==
      null
  ) {
    validateCheckpointAwareValueComparisonProductionConfiguration(
      productionConfiguration
    );

    if (
      productionConfiguration
        .authority
        .productionAdapterEnabled !==
          false ||
      productionConfiguration
        .authority
        .productionExternalStateWriteAuthorized !==
          false ||
      productionConfiguration
        .authority
        .productionKernelInvocationAuthorized !==
          false ||
      productionConfiguration
        .authority
        .repairExecutionAuthorized !==
          false
    ) {
      throw new Error(
        "value_comparison_production_external_state_configuration_authority_invalid"
      );
    }

    configurationState =
      "VALIDATED_BUT_ADAPTER_DISABLED";

    configurationFingerprint =
      productionConfiguration
        .configurationFingerprint;

    externalStateRoot =
      productionConfiguration
        .externalState
        .root;
  }

  const blockers = [
    ...(
      productionConfiguration ===
        null
        ? [
            "PRODUCTION_CONFIGURATION_NOT_BOUND"
          ]
        : []
    ),

    "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_production_external_state_adapter_configuration_contract",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      productionConfiguration ===
        null
        ? "CONFIGURATION_NOT_BOUND_EXTERNAL_STATE_ADAPTER_DISABLED"
        : "CONFIGURATION_VALIDATED_EXTERNAL_STATE_ADAPTER_DISABLED",

    implementation: {
      productionExternalStateAdapterConfigurationContractImplemented:
        true,

      productionConfigurationBindingSupported:
        true,

      exactR19MethodSurfacePinned:
        true,

      exactR19LockReplayJournalBackupAuditSemanticsPinned:
        true,

      productionExternalStateAdapterImplemented:
        false,

      productionKernelAdapterImplemented:
        false,

      endToEndProductionOrchestratorImplemented:
        false
    },

    productionConfiguration: {
      state:
        configurationState,

      configurationFingerprint,

      externalStateRoot,

      externalStateRootOutsideRepositoryRequired:
        true,

      callerSuppliedProjectRootForbidden:
        true,

      callerSuppliedTrustForbidden:
        true
    },

    requiredMethodSurface:
      [
        ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      ],

    preservedR19Semantics: {
      externalGlobalLockRequired:
        true,

      singleWriterExecutionRequired:
        true,

      atomicSingleUseReplayConsumeRequired:
        true,

      replayReleaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true,

      durableTransactionJournalRequired:
        true,

      verifiedExternalBackupBeforeMutationRequired:
        true,

      journalStaticIdentityMustNotDrift:
        true,

      unfinishedJournalBlocksNewForwardExecution:
        true,

      ambiguousTargetStateFailsToRecoveryRequired:
        true,

      terminalAuditRequired:
        true,

      lockReleaseBeforeTerminalAuditForbidden:
        true,

      recoveryUsesExactPreimageOrPostimageClassification:
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

    requiredNextGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_DISABLED_IMPLEMENTATION_SANDBOX",

      implementationMustUseValidatedProductionConfigurationOnly:
        true,

      implementationMustUseExactRequiredMethodSurface:
        true,

      implementationMustPreserveR19Semantics:
        true,

      implementationMustRemainDisabledForRealProductionRoot:
        true,

      implementationTestsMayUseOnlyIsolatedTemporaryRoots:
        true,

      productionKernelMustRemainDisabled:
        true,

      signerUseForbidden:
        true,

      privateKeyReadForbidden:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      productionAdapterEnabled:
        false,

      productionConfigurationBindingAuthorized:
        false,

      productionExternalStateAdapterConstructionAuthorized:
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

  artifact.configurationContractFingerprint =
    checkpointAwareValueComparisonProductionExternalStateConfigurationFingerprint(
      artifact
    );

  return artifact;
}
