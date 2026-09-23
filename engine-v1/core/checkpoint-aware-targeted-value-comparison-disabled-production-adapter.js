import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-disabled-production-adapter.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE =
  Object.freeze({
    DISABLED_NO_MUTATION_REQUIRED:
      "DISABLED_NO_MUTATION_REQUIRED",

    DISABLED_EXECUTION_STACK_INCOMPATIBLE:
      "DISABLED_EXECUTION_STACK_INCOMPATIBLE"
  });

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const EXPECTED_TARGET_SCOPE = Object.freeze([
  null,
  "data/value-comparison/cumulative.json"
]);

const REQUIRED_LEGACY_REPAIR_CLASSES = Object.freeze([
  "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
  "REBUILD_HISTORY_ELIGIBLE_ROW",
  "REBUILD_PUBLICATION_CANONICAL_ROW"
]);

const DEDICATED_REPAIR_CLASS =
  "REBUILD_VALUE_COMPARISON_ONLY";

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

function sortedUniqueStrings(values) {
  return [
    ...new Set(
      (
        Array.isArray(values)
          ? values
          : []
      )
        .map(clean)
        .filter(Boolean)
    )
  ]
    .sort();
}

function sameStrings(left, right) {
  return (
    JSON.stringify(
      sortedUniqueStrings(
        left
      )
    ) ===
    JSON.stringify(
      sortedUniqueStrings(
        right
      )
    )
  );
}

function exactTargetScope(dayKey) {
  return [
    `data/value-comparison/${dayKey}.json`,
    EXPECTED_TARGET_SCOPE[1]
  ];
}

function validateLegacyCompatibility(
  compatibility
) {
  if (
    !compatibility ||
    typeof compatibility !==
      "object" ||
    Array.isArray(
      compatibility
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_compatibility_required"
    );
  }

  const authorizationClasses =
    sortedUniqueStrings(
      compatibility
        .authorizationV2SupportedRepairClasses
    );

  const transactionClasses =
    sortedUniqueStrings(
      compatibility
        .transactionPlanSupportedRepairClasses
    );

  if (
    compatibility
      .genericPlanProtectsValueComparison !==
        true ||
    compatibility
      .targetVerifierProtectsValueComparison !==
        true
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_legacy_path_protection_not_proven"
    );
  }

  if (
    !sameStrings(
      authorizationClasses,
      REQUIRED_LEGACY_REPAIR_CLASSES
    ) ||
    !sameStrings(
      transactionClasses,
      REQUIRED_LEGACY_REPAIR_CLASSES
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_legacy_repair_class_surface_unexpected"
    );
  }

  if (
    authorizationClasses.includes(
      DEDICATED_REPAIR_CLASS
    ) ||
    transactionClasses.includes(
      DEDICATED_REPAIR_CLASS
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_dedicated_class_unexpectedly_supported"
    );
  }

  return {
    genericPlanProtectsValueComparison:
      true,

    targetVerifierProtectsValueComparison:
      true,

    authorizationV2SupportedRepairClasses:
      authorizationClasses,

    transactionPlanSupportedRepairClasses:
      transactionClasses,

    dedicatedRepairClass:
      DEDICATED_REPAIR_CLASS,

    authorizationV2SupportsDedicatedRepairClass:
      false,

    transactionPlanSupportsDedicatedRepairClass:
      false
  };
}

export function checkpointAwareValueComparisonDisabledProductionAdapterFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_artifact_required"
    );
  }

  const {
    adapterFingerprint:
      _ignored,
    ...unsigned
  } = artifact;

  return fingerprint(
    unsigned
  );
}

export function buildCheckpointAwareValueComparisonDisabledProductionAdapterContract({
  dayKey,
  sourcePreflightState,
  proposedMutationCount,
  sourceSandboxSimulationState,
  sourceSandboxRollbackVerified,
  compatibility,
  productionExecutionReadiness
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_day_invalid"
    );
  }

  if (
    ![
      "NO_MUTATION_REQUIRED",
      "MUTATION_CANDIDATE_READY"
    ].includes(
      sourcePreflightState
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_preflight_state_invalid"
    );
  }

  const mutationCount =
    Number(
      proposedMutationCount
    );

  if (
    !Number.isInteger(
      mutationCount
    ) ||
    mutationCount <
      0 ||
    mutationCount >
      2
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_mutation_count_invalid"
    );
  }

  if (
    (
      sourcePreflightState ===
        "NO_MUTATION_REQUIRED" &&
      mutationCount !==
        0
    ) ||
    (
      sourcePreflightState ===
        "MUTATION_CANDIDATE_READY" &&
      mutationCount ===
        0
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_preflight_count_mismatch"
    );
  }

  if (
    ![
      "NO_TRANSACTION_REQUIRED",
      "SIMULATED_AND_ROLLED_BACK"
    ].includes(
      sourceSandboxSimulationState
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_sandbox_state_invalid"
    );
  }

  if (
    sourcePreflightState ===
      "NO_MUTATION_REQUIRED" &&
    sourceSandboxSimulationState !==
      "NO_TRANSACTION_REQUIRED"
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_noop_sandbox_state_mismatch"
    );
  }

  if (
    sourcePreflightState ===
      "MUTATION_CANDIDATE_READY" &&
    (
      sourceSandboxSimulationState !==
        "SIMULATED_AND_ROLLED_BACK" ||
      sourceSandboxRollbackVerified !==
        true
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_mutation_requires_verified_rollback_simulation"
    );
  }

  if (
    !productionExecutionReadiness ||
    typeof productionExecutionReadiness !==
      "object" ||
    productionExecutionReadiness
      .productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_production_kernel_must_remain_disabled"
    );
  }

  const legacy =
    validateLegacyCompatibility(
      compatibility
    );

  const blockers = [
    {
      code:
        "LEGACY_AUTONOMOUS_REPAIR_PLAN_PROTECTS_VALUE_COMPARISON_PATHS",

      blocking:
        true
    },
    {
      code:
        "LEGACY_TARGET_VERIFIER_PROTECTS_VALUE_COMPARISON_PATHS",

      blocking:
        true
    },
    {
      code:
        "AUTHORIZATION_V2_REPAIR_CLASS_UNSUPPORTED",

      blocking:
        true
    },
    {
      code:
        "TRANSACTION_PLAN_REPAIR_CLASS_UNSUPPORTED",

      blocking:
        true
    },
    {
      code:
        "PRODUCTION_KERNEL_DISABLED",

      blocking:
        true
    }
  ];

  const adapterState =
    mutationCount ===
      0
      ? CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE
          .DISABLED_NO_MUTATION_REQUIRED
      : CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_STATE
          .DISABLED_EXECUTION_STACK_INCOMPATIBLE;

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_SCHEMA,

    version:
      "1.0.0",

    role:
      "disabled_production_transaction_adapter_contract",

    mode:
      "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT",

    dayKey:
      day,

    route: {
      failureClass:
        "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL",

      repairUnit:
        "rebuild_day_value_comparison_and_cumulative_only",

      dedicatedRepairClass:
        DEDICATED_REPAIR_CLASS
    },

    sourceEvidence: {
      preflightState:
        sourcePreflightState,

      proposedMutationCount:
        mutationCount,

      sandboxSimulationState:
        sourceSandboxSimulationState,

      sandboxRollbackVerified:
        sourceSandboxRollbackVerified ===
          true
    },

    exactTargetScope:
      exactTargetScope(
        day
      ),

    adapterState,

    blockers,

    legacyCompatibility:
      legacy,

    productionExecutionBoundary: {
      observedState:
        productionExecutionReadiness
          .state ||
        null,

      trustedKeyCount:
        Number(
          productionExecutionReadiness
            .trustedKeyCount ||
          0
        ),

      pinnedTrustRequired:
        productionExecutionReadiness
          .pinnedTrustRequired ===
            true,

      callerSuppliedTrustForbidden:
        productionExecutionReadiness
          .callerSuppliedTrustForbidden ===
            true,

      callerSuppliedProjectRootForbidden:
        productionExecutionReadiness
          .callerSuppliedProjectRootForbidden ===
            true,

      productionKernelEnabled:
        false,

      existingProductionEntrypointCompatible:
        false,

      existingAuthorizationV2Compatible:
        false,

      existingTransactionPlanCompatible:
        false
    },

    requiredNextDesignGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_AUTHORIZATION_AND_TRANSACTION_SCHEMA_DESIGN",

      mayReuseLegacyProtectedPathBypass:
        false,

      maySilentlyAddDedicatedClassToLegacyV2:
        false,

      mustPreserveExternalSignedAuthorizationBoundary:
        true,

      mustPreserveSingleUseReplayProtection:
        true,

      mustPreserveExactPreimageVerification:
        true,

      mustPreserveVerifiedBackupAndReverseRollback:
        true,

      mustRemainDisabledUntilIndependentContractValidation:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      adapterEnabled:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      mutableExecutionAuthorized:
        false,

      protectedPathBypassAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false,

      workflowMutationAuthorized:
        false
    }
  };

  artifact.adapterFingerprint =
    checkpointAwareValueComparisonDisabledProductionAdapterFingerprint(
      artifact
    );

  return artifact;
}
