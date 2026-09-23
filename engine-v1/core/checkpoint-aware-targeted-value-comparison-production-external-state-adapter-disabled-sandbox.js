import {
  createHash
} from "node:crypto";

import {
  createCheckpointAwareValueComparisonExternalStateSandboxAdapter
} from "./checkpoint-aware-targeted-value-comparison-external-state-crash-recovery.js";

import {
  validateCheckpointAwareValueComparisonProductionConfiguration
} from "./checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS,
  validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape
} from "./checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_DISABLED_SANDBOX_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-disabled-implementation-sandbox.v1";

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

function validateR22Boundary(
  sourceR22,
  dayKey,
  remoteHead
) {
  if (
    !sourceR22 ||
    typeof sourceR22 !==
      "object" ||
    sourceR22.mode !==
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT" ||
    sourceR22.dayKey !==
      dayKey ||
    sourceR22.remoteHead !==
      remoteHead ||
    sourceR22.contract
      ?.state !==
        "CONFIGURATION_NOT_BOUND_EXTERNAL_STATE_ADAPTER_DISABLED" ||
    sourceR22.contract
      ?.implementation
      ?.productionExternalStateAdapterConfigurationContractImplemented !==
        true ||
    sourceR22.contract
      ?.implementation
      ?.exactR19MethodSurfacePinned !==
        true ||
    sourceR22.contract
      ?.implementation
      ?.exactR19LockReplayJournalBackupAuditSemanticsPinned !==
        true ||
    sourceR22.contract
      ?.implementation
      ?.productionExternalStateAdapterImplemented !==
        false ||
    sourceR22.contract
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_DISABLED_IMPLEMENTATION_SANDBOX" ||
    sourceR22.contract
      ?.authority
      ?.productionAdapterEnabled !==
        false ||
    sourceR22.contract
      ?.authority
      ?.productionExternalStateAdapterConstructionAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR22.contract
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR22.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR22.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_production_external_state_disabled_sandbox_r22_boundary_invalid"
    );
  }

  const expected =
    CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS;

  const actual =
    sourceR22.contract
      ?.requiredMethodSurface;

  if (
    !Array.isArray(
      actual
    ) ||
    actual.length !==
      expected.length ||
    actual.some(
      (
        method,
        index
      ) =>
        method !==
          expected[index]
    )
  ) {
    throw new Error(
      "value_comparison_production_external_state_disabled_sandbox_method_surface_invalid"
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

    requiredMethodSurface:
      artifact.requiredMethodSurface,

    preservedSemantics:
      artifact.preservedSemantics,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionExternalStateDisabledSandboxFingerprint(
  artifact
) {
  return fingerprint(
    semanticCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract({
  dayKey,
  remoteHead,
  sourceR22
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
      "value_comparison_production_external_state_disabled_sandbox_identity_invalid"
    );
  }

  validateR22Boundary(
    sourceR22,
    day,
    head
  );

  const blockers = [
    "PRODUCTION_CONFIGURATION_NOT_BOUND",
    "PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_NOT_AUTHORIZED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_DISABLED_SANDBOX_SCHEMA,

    version:
      "1.0.0",

    role:
      "disabled_production_external_state_adapter_implementation_sandbox_contract",

    mode:
      "DISABLED_PRODUCTION_EXTERNAL_STATE_ADAPTER_IMPLEMENTATION_SANDBOX",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      "ISOLATED_SANDBOX_IMPLEMENTATION_AVAILABLE_PRODUCTION_ROOT_DISABLED",

    implementation: {
      dedicatedExternalStateAdapterImplementationSandboxImplemented:
        true,

      delegatesToR19VerifiedExternalStatePrimitive:
        true,

      exactThirteenMethodSurfaceImplemented:
        true,

      isolatedTemporaryRootOnly:
        true,

      validatedProductionConfigurationRequiredForConstruction:
        true,

      productionRealRootBindingImplemented:
        false,

      productionRealRootEnabled:
        false,

      productionKernelAdapterImplemented:
        false,

      endToEndProductionOrchestratorImplemented:
        false
    },

    requiredMethodSurface:
      [
        ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      ],

    preservedSemantics: {
      externalGlobalLockRequired:
        true,

      atomicSingleUseReplayRequired:
        true,

      replayReleaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true,

      durableJournalRequired:
        true,

      verifiedExternalBackupRequired:
        true,

      unfinishedJournalBlocksForwardExecution:
        true,

      ambiguousStateFailsToRecoveryRequired:
        true,

      terminalAuditRequired:
        true,

      productionRootWritesForbidden:
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
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT_READ_ONLY",

      mustBindValidatedProductionConfiguration:
        true,

      mustNotConstructAdapterDuringReadOnlyObservation:
        true,

      mustNotWriteExternalProductionState:
        true,

      mustNotConsumeReplay:
        true,

      mustPreserveExactThirteenMethodSurface:
        true,

      productionKernelMustRemainDisabled:
        true,

      signerUseForbidden:
        true,

      privateKeyReadForbidden:
        true
    },

    authority: {
      readOnlyObservation:
        true,

      isolatedSandboxConstructionAuthorizedInTestsOnly:
        true,

      productionConfigurationBindingAuthorized:
        false,

      productionExternalStateRealRootConstructionAuthorized:
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

  artifact.sandboxContractFingerprint =
    checkpointAwareValueComparisonProductionExternalStateDisabledSandboxFingerprint(
      artifact
    );

  return artifact;
}

export function createCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxAdapter({
  productionConfiguration,
  implementationMode =
    null
} = {}) {
  if (
    implementationMode !==
      "ISOLATED_TEMP_SANDBOX"
  ) {
    throw new Error(
      "value_comparison_production_external_state_disabled_sandbox_mode_invalid"
    );
  }

  validateCheckpointAwareValueComparisonProductionConfiguration(
    productionConfiguration
  );

  if (
    productionConfiguration
      .authority
      ?.productionAdapterEnabled !==
        false ||
    productionConfiguration
      .authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    productionConfiguration
      .authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    productionConfiguration
      .authority
      ?.repairExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_production_external_state_disabled_sandbox_configuration_authority_invalid"
    );
  }

  const underlying =
    createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
      externalStateRoot:
        productionConfiguration
          .externalState
          .root,

      projectRoot:
        productionConfiguration
          .projectRootBinding
          .projectRoot
    });

  validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape(
    underlying
  );

  const adapter =
    Object.fromEntries(
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
        .map(
          method => [
            method,
            (
              ...args
            ) =>
              underlying[
                method
              ](
                ...args
              )
          ]
        )
    );

  validateCheckpointAwareValueComparisonProductionExternalStateAdapterShape(
    adapter
  );

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-disabled-adapter-instance.v1",

    mode:
      "ISOLATED_TEMP_SANDBOX",

    productionConfigurationFingerprint:
      productionConfiguration
        .configurationFingerprint,

    methodSurface:
      [
        ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      ],

    adapter,

    authority: {
      isolatedTemporaryRootsOnly:
        true,

      productionRealRootAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false
    }
  };
}
