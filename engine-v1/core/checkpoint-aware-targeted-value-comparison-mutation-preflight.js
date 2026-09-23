import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-mutation-preflight.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE =
  Object.freeze({
    NO_MUTATION_REQUIRED:
      "NO_MUTATION_REQUIRED",

    MUTATION_CANDIDATE_READY:
      "MUTATION_CANDIDATE_READY"
  });

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const REMOTE_SHA_RE =
  /^[0-9a-f]{40}$/u;

const SHA256_RE =
  /^[0-9a-f]{64}$/u;

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

function exactPaths(
  dayKey
) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

function validateTarget({
  target,
  expectedPath
}) {
  if (
    !target ||
    typeof target !==
      "object" ||
    Array.isArray(
      target
    )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_target_invalid"
    );
  }

  if (
    clean(
      target.targetPath
    ) !==
      expectedPath
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_target_path_invalid"
    );
  }

  if (
    target.targetExists !==
      true
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_existing_preimage_required"
    );
  }

  if (
    !SHA256_RE.test(
      clean(
        target.preimageSha256
      )
    ) ||
    !Number.isInteger(
      Number(
        target.preimageBytes
      )
    ) ||
    Number(
      target.preimageBytes
    ) <=
      0
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_preimage_identity_invalid"
    );
  }

  if (
    !SHA256_RE.test(
      clean(
        target.candidateMaterialSha256
      )
    ) ||
    !Number.isInteger(
      Number(
        target.candidateMaterialBytes
      )
    ) ||
    Number(
      target.candidateMaterialBytes
    ) <=
      0
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_candidate_identity_invalid"
    );
  }

  if (
    typeof target.semanticChange !==
      "boolean" ||
    !Array.isArray(
      target.semanticDiffPaths
    )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_semantic_identity_invalid"
    );
  }

  if (
    target.semanticChange ===
      true &&
    clean(
      target.preimageSha256
    ) ===
      clean(
        target.candidateMaterialSha256
      )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_changed_semantics_require_distinct_material"
    );
  }

  return {
    targetPath:
      expectedPath,

    targetExists:
      true,

    mutationMode:
      target.semanticChange
        ? "REPLACE"
        : "NOOP",

    proposedMutation:
      target.semanticChange ===
        true,

    preimage: {
      sha256:
        clean(
          target.preimageSha256
        ),

      bytes:
        Number(
          target.preimageBytes
        )
    },

    candidateMaterial: {
      sha256:
        clean(
          target.candidateMaterialSha256
        ),

      bytes:
        Number(
          target.candidateMaterialBytes
        ),

      ephemeral:
        true,

      rawPostimageBindingFinal:
        false,

      futureExecutionRequirement:
        "REMATERIALIZE_IN_ONE_TRANSACTION_ATTEMPT_AND_BIND_EXACT_BYTES_BEFORE_ANY_REPOSITORY_WRITE"
    },

    semantics: {
      changed:
        target.semanticChange ===
          true,

      diffPaths:
        [
          ...target
            .semanticDiffPaths
        ]
    }
  };
}

export function checkpointAwareValueComparisonMutationPreflightFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_artifact_required"
    );
  }

  const {
    preflightFingerprint:
      _ignored,
    ...unsigned
  } = artifact;

  return fingerprint(
    unsigned
  );
}

export function buildCheckpointAwareValueComparisonMutationPreflight({
  dayKey,
  remoteHead,
  decision,
  executorContract,
  targets,
  productionExecutionReadiness
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
    )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_day_invalid"
    );
  }

  if (
    !REMOTE_SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_remote_head_invalid"
    );
  }

  if (
    decision
      ?.decisionState !==
        "BOUNDED_REPAIR_PLAN" ||
    decision
      ?.failureClass !==
        "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL" ||
    decision
      ?.repairUnit !==
        "rebuild_day_value_comparison_and_cumulative_only"
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_decision_route_invalid"
    );
  }

  if (
    executorContract
      ?.mode !==
        "DRY_RUN_ONLY" ||
    executorContract
      ?.sourceDecision
      ?.decisionFingerprint !==
        decision
          ?.decisionFingerprint ||
    executorContract
      ?.sourceDecision
      ?.failureClass !==
        decision
          ?.failureClass ||
    executorContract
      ?.sourceDecision
      ?.repairUnit !==
        decision
          ?.repairUnit ||
    executorContract
      ?.authority
      ?.mutableExecutionAuthorized !==
        false ||
    executorContract
      ?.authority
      ?.repositoryWriteAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_executor_contract_invalid"
    );
  }

  const expectedPaths =
    exactPaths(
      day
    );

  if (
    JSON.stringify(
      executorContract
        ?.repairContract
        ?.allowedRepositoryOutputsAfterFutureAuthorization
    ) !==
      JSON.stringify(
        expectedPaths
      )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_executor_output_scope_invalid"
    );
  }

  const inputTargets =
    Array.isArray(
      targets
    )
      ? targets
      : [];

  if (
    inputTargets.length !==
      2
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_exact_two_targets_required"
    );
  }

  const byPath =
    new Map();

  for (
    const target of
      inputTargets
  ) {
    const targetPath =
      clean(
        target
          ?.targetPath
      );

    if (
      byPath.has(
        targetPath
      )
    ) {
      throw new Error(
        "value_comparison_mutation_preflight_duplicate_target"
      );
    }

    byPath.set(
      targetPath,
      target
    );
  }

  const normalizedTargets =
    expectedPaths.map(
      targetPath =>
        validateTarget({
          target:
            byPath.get(
              targetPath
            ),
          expectedPath:
            targetPath
        })
    );

  if (
    !productionExecutionReadiness ||
    typeof productionExecutionReadiness !==
      "object" ||
    productionExecutionReadiness
      .productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_production_kernel_must_remain_disabled"
    );
  }

  const operations =
    normalizedTargets
      .filter(
        target =>
          target
            .proposedMutation
      )
      .map(
        (
          target,
          index
        ) => ({
          order:
            index +
            1,

          targetPath:
            target
              .targetPath,

          mutationMode:
            "REPLACE",

          preimageSha256:
            target
              .preimage
              .sha256,

          candidateMaterialSha256:
            target
              .candidateMaterial
              .sha256,

          exactBytesNotYetAuthorityBound:
            true
        })
      );

  const preflightState =
    operations.length ===
      0
      ? CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE
          .NO_MUTATION_REQUIRED
      : CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_STATE
          .MUTATION_CANDIDATE_READY;

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_MUTATION_PREFLIGHT_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_mutation_bridge_preflight",

    mode:
      "MUTATION_PREFLIGHT_ONLY",

    dayKey:
      day,

    remoteHead:
      head,

    preflightState,

    bindings: {
      decisionFingerprint:
        decision
          .decisionFingerprint,

      executorContractFingerprint:
        executorContract
          .contractFingerprint
    },

    exactTargetScope:
      expectedPaths,

    targets:
      normalizedTargets,

    operations,

    summary: {
      exactTargetCount:
        2,

      proposedMutationCount:
        operations.length,

      semanticNoopCount:
        normalizedTargets
          .filter(
            target =>
              !target
                .proposedMutation
          )
          .length
    },

    legacyCompatibilityBoundary: {
      genericAutonomousRepairPlanProtectedPath:
        true,

      genericAutonomousRepairTargetVerifierProtectedPath:
        true,

      genericAutonomousRepairPlanReused:
        false,

      protectedPathBypassAuthorized:
        false,

      dedicatedBridgeRequired:
        true,

      reason:
        "value_comparison_paths_remain_protected_by_the_legacy_generic_repair_plan_and_target_verifier"
    },

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

      productionKernelEnabled:
        false,

      productionKernelInvocationAuthorized:
        false,

      signerUseAuthorized:
        false,

      authorizationArtifactCreated:
        false,

      externalAuthorizationV2RequiredBeforeAnyFutureProductionMutation:
        true
    },

    nextRequiredBridgeGate: {
      name:
        "ISOLATED_SANDBOX_TRANSACTION_MATERIALIZATION_AND_ROLLBACK_SIMULATION",

      productionRepositoryTarget:
        false,

      exactCandidateBytesMustBeBoundWithinSingleSimulationAttempt:
        true,

      rollbackMustBeVerified:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      candidateMaterialMayBeBuiltInTemp:
        true,

      repositoryWriteAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      mutableExecutionAuthorized:
        false,

      signerUseAuthorized:
        false,

      productionKernelEnableAuthorized:
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

  artifact.preflightFingerprint =
    checkpointAwareValueComparisonMutationPreflightFingerprint(
      artifact
    );

  return artifact;
}
