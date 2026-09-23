import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-repair-executor-contract.v1";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE =
  "DRY_RUN_ONLY";

export const VALUE_COMPARISON_STALE_FAILURE_CLASS =
  "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL";

export const VALUE_COMPARISON_REPAIR_UNIT =
  "rebuild_day_value_comparison_and_cumulative_only";

export const CURRENT_DAY_PUBLICATION_FAILURE_CLASS =
  "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING";

export const CURRENT_DAY_PUBLICATION_REPAIR_UNIT =
  "inspect_existing_day_artifacts_and_route_to_exact_failed_gate";

export const CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_MODE =
  "READ_ONLY_INSPECTION";

export const DETAILS_ORPHAN_FAILURE_CLASS =
  "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE";

export const DETAILS_ORPHAN_REPAIR_UNIT =
  "remove_only_verified_orphan_derived_detail_files";

export const FRESHNESS_COVERAGE_FAILURE_CLASS =
  "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST";

export const FRESHNESS_COVERAGE_REPAIR_UNIT =
  "rebuild_coverage_readiness_then_manifest_only_reexport_preserving_value_and_details";

export const CANONICAL_SUPPRESSED_ALIAS_FAILURE_CLASS =
  "CANONICAL_SUPPRESSED_ALIAS_PRESENT";

export const CANONICAL_SUPPRESSED_ALIAS_REPAIR_UNIT =
  "resolver_membership_gate_suppression_only";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function text(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
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
      Object.keys(value)
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

function sha256Json(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function assertZeroDecisionAuthority(
  decision
) {
  for (
    const field of [
      "projectWriteAuthorized",
      "filesystemWriteAuthorized",
      "repairExecutionAuthorized",
      "productionKernelEnableAuthorized",
      "workflowMutationAuthorized",
      "commitAuthorized",
      "pushAuthorized",
      "deployAuthorized",
      "broadDailyRecoveryAuthorized"
    ]
  ) {
    if (
      decision
        ?.authority
        ?.[field] ===
          true
    ) {
      throw new Error(
        `checkpoint_executor_decision_authority_forbidden:${field}`
      );
    }
  }

  if (
    decision
      ?.executionBoundary
      ?.productionKernelEnabled ===
        true
  ) {
    throw new Error(
      "checkpoint_executor_production_kernel_forbidden"
    );
  }
}

export function checkpointAwareTargetedRepairExecutorContractFingerprint(
  artifact
) {
  const unsigned = {
    ...artifact
  };

  delete unsigned.contractFingerprint;

  return sha256Json(
    unsigned
  );
}

export function buildCheckpointAwareTargetedRepairExecutorContract({
  decision
} = {}) {
  if (
    !decision ||
    typeof decision !==
      "object"
  ) {
    throw new Error(
      "checkpoint_executor_decision_required"
    );
  }

  if (
    !DAY_RE.test(
      text(
        decision.dayKey
      )
    )
  ) {
    throw new Error(
      "checkpoint_executor_day_key_invalid"
    );
  }

  assertZeroDecisionAuthority(
    decision
  );

  const decisionState =
    text(
      decision.decisionState
    );

  if (
    ![
      "BOUNDED_REPAIR_PLAN",
      "READ_ONLY_INSPECTION_PLAN"
    ]
      .includes(
        decisionState
      )
  ) {
    throw new Error(
      `checkpoint_executor_decision_state_not_requestable:${decisionState || "missing"}`
    );
  }

  const isValueComparisonRoute =
    decision.failureClass ===
      VALUE_COMPARISON_STALE_FAILURE_CLASS &&
    decision.repairUnit ===
      VALUE_COMPARISON_REPAIR_UNIT;

  const isPublicationInspectionRoute =
    decision.failureClass ===
      CURRENT_DAY_PUBLICATION_FAILURE_CLASS &&
    decision.repairUnit ===
      CURRENT_DAY_PUBLICATION_REPAIR_UNIT;

  const isDetailsOrphanRoute =
    decision.failureClass ===
      DETAILS_ORPHAN_FAILURE_CLASS &&
    decision.repairUnit ===
      DETAILS_ORPHAN_REPAIR_UNIT;

  const isFreshnessCoverageRoute =
    decision.failureClass ===
      FRESHNESS_COVERAGE_FAILURE_CLASS &&
    decision.repairUnit ===
      FRESHNESS_COVERAGE_REPAIR_UNIT;

  const isCanonicalSuppressionRoute =
    decision.failureClass ===
      CANONICAL_SUPPRESSED_ALIAS_FAILURE_CLASS &&
    decision.repairUnit ===
      CANONICAL_SUPPRESSED_ALIAS_REPAIR_UNIT;

  if (
    !isValueComparisonRoute &&
    !isPublicationInspectionRoute &&
    !isDetailsOrphanRoute &&
    !isFreshnessCoverageRoute &&
    !isCanonicalSuppressionRoute
  ) {
    throw new Error(
      `checkpoint_executor_route_not_implemented:${text(decision.failureClass)}:${text(decision.repairUnit)}`
    );
  }

  const routeStateValid =
    (
      (
        isValueComparisonRoute ||
        isDetailsOrphanRoute ||
        isFreshnessCoverageRoute ||
        isCanonicalSuppressionRoute
      ) &&
      decisionState ===
        "BOUNDED_REPAIR_PLAN"
    ) ||
    (
      isPublicationInspectionRoute &&
      decisionState ===
        "READ_ONLY_INSPECTION_PLAN"
    );

  if (
    !routeStateValid
  ) {
    throw new Error(
      `checkpoint_executor_decision_state_not_requestable:${decisionState || "missing"}`
    );
  }

  const requiredBeforeBoundedExecution =
    decision
      ?.executionAuthorization
      ?.requiredBeforeBoundedExecution;

  const authorizationBoundaryValid =
    decision
      ?.executionAuthorization
      ?.authorizationGrantedByThisDecision ===
        false &&
    (
      (
        (
          isValueComparisonRoute ||
          isDetailsOrphanRoute ||
          isFreshnessCoverageRoute ||
          isCanonicalSuppressionRoute
        ) &&
        requiredBeforeBoundedExecution ===
          true
      ) ||
      (
        isPublicationInspectionRoute &&
        requiredBeforeBoundedExecution ===
          false
      )
    );

  if (
    !authorizationBoundaryValid
  ) {
    throw new Error(
      "checkpoint_executor_authorization_boundary_invalid"
    );
  }

  const dayKey =
    text(
      decision.dayKey
    );

  if (
    isCanonicalSuppressionRoute
  ) {
    const canonicalSuppressionArtifact = {
      schema:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

      version:
        "1.4.0",

      role:
        "read_only_bounded_repair_executor_contract",

      mode:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,

      dayKey,

      sourceDecision: {
        decisionFingerprint:
          text(
            decision
              .decisionFingerprint
          ),
        decisionState:
          decision
            .decisionState,
        failureClass:
          decision
            .failureClass,
        repairUnit:
          decision
            .repairUnit,
        resumeCheckpoint:
          decision
            .resumeCheckpoint
      },

      repairContract: {
        exactRepairUnit:
          CANONICAL_SUPPRESSED_ALIAS_REPAIR_UNIT,

        purpose:
          "plan_resolver_membership_suppression_only_without_mutating_canonical_source_truth",

        planner: {
          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-canonical-suppression-dry-run-day.js",

          observer:
            "observeCanonicalSuppressedAliasForShadow",

          membershipGate:
            "applyProductionIdentityMembershipGate",

          resolver:
            "getProductionIdentityResolverRuntime",

          failedConsumerTargetStatus:
            "REQUIRED_BEFORE_MUTABLE_EXECUTION"
        },

        allowedRepositoryOutputsAfterFutureAuthorization:
          [],

        outputScope:
          "NO_REPOSITORY_OUTPUTS_UNTIL_FAILED_CONSUMER_TARGET_IDENTIFIED",

        futureOperation:
          "IN_MEMORY_RESOLVER_MEMBERSHIP_SUPPRESSION_ONLY",

        forbiddenOperations: [
          "delete_canonical_fixture_source_row",
          "rewrite_canonical_fixture_partition",
          "retarget_identity_resolver_ledger",
          "rewrite_identity_ledger",
          "rewrite_history",
          "rebuild_value_model",
          "rebuild_details",
          "full_daily_cycle",
          "workflow_mutation",
          "commit",
          "push",
          "deploy"
        ],

        dryRun: {
          readOnly:
            true,

          exactLeakedFixtureIdEnumeration:
            true,

          productionResolverClassificationRequired:
            true,

          repositoryMutation:
            false,

          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-canonical-suppression-dry-run-day.js"
        },

        postconditionsForFutureMutableExecution: [
          "exact_failed_consumer_identified",
          "every_leaked_fixture_id_resolves_as_suppressed_lineage_alias",
          "canonical_source_truth_bytes_unchanged",
          "identity_resolver_ledger_bytes_unchanged",
          "post_gate_suppressed_alias_count_zero",
          "canonical_semantic_fixed_point_reverified",
          "resume_from_canonical_semantic_reverification_then_downstream",
          "remote_head_race_guard_clean"
        ]
      },

      authority: {
        planningOnly:
          true,
        dryRunAuthorized:
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
        commitAuthorized:
          false,
        pushAuthorized:
          false,
        deployAuthorized:
          false,
        workflowMutationAuthorized:
          false,
        externalAuthorizationV2RequiredBeforeMutableExecution:
          true
      },

      existingAutonomousRepairPlanCompatibility: {
        reusedAsMutableExecutionPlan:
          false,

        reason:
          "canonical_identity_suppression_is_a_projection_only_repair_and_must_not_mutate_source_truth_or_identity_ledgers"
      }
    };

    canonicalSuppressionArtifact.contractFingerprint =
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        canonicalSuppressionArtifact
      );

    return canonicalSuppressionArtifact;
  }

  if (
    isFreshnessCoverageRoute
  ) {
    const freshnessArtifact = {
      schema:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

      version:
        "1.3.0",

      role:
        "read_only_bounded_repair_executor_contract",

      mode:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,

      dayKey,

      sourceDecision: {
        decisionFingerprint:
          text(
            decision
              .decisionFingerprint
          ),
        decisionState:
          decision
            .decisionState,
        failureClass:
          decision
            .failureClass,
        repairUnit:
          decision
            .repairUnit,
        resumeCheckpoint:
          decision
            .resumeCheckpoint
      },

      repairContract: {
        exactRepairUnit:
          FRESHNESS_COVERAGE_REPAIR_UNIT,

        purpose:
          "plan_only_the_coverage_readiness_newer_than_manifest_repair_without_rebuilding_value_or_details",

        planner: {
          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-freshness-coverage-readiness-dry-run-day.js",

          sourceReport:
            `data/deploy-snapshots/${dayKey}/freshness-report.json`,

          existingCoverageReadinessProducer:
            "engine-v1/jobs/build-league-gap-report-day.js",

          manifestOnlyAdapterStatus:
            "DEDICATED_ADAPTER_REQUIRED_BEFORE_MUTABLE_EXECUTION",

          currentFullSnapshotExporterAuthorized:
            false
        },

        allowedRepositoryOutputsAfterFutureAuthorization: [
          `data/coverage-readiness/${dayKey}.json`,
          `data/deploy-snapshots/${dayKey}/manifest.json`,
          `data/deploy-snapshots/${dayKey}/freshness-report.json`
        ],

        outputScope:
          "EXACT_THREE_PATHS_ONLY",

        mustRemainByteIdentical: [
          `data/deploy-snapshots/${dayKey}/value.json`,
          `data/deploy-snapshots/${dayKey}/value-audit.json`,
          `data/deploy-snapshots/${dayKey}/details/*.json`
        ],

        forbiddenOperations: [
          "build_details",
          "refresh_value_artifacts",
          "rebuild_value_model",
          "replace_snapshot_details",
          "rewrite_snapshot_value",
          "full_snapshot_reexport",
          "promote_latest_pointer",
          "full_daily_cycle",
          "workflow_mutation",
          "commit",
          "push",
          "deploy"
        ],

        dryRun: {
          readOnly:
            true,

          exactFreshnessClassification:
            true,

          preservationHashesCaptured:
            true,

          repositoryMutation:
            false,

          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-freshness-coverage-readiness-dry-run-day.js"
        },

        postconditionsForFutureMutableExecution: [
          "coverage_readiness_is_only_input_newer_than_manifest",
          "no_stale_derived_artifacts",
          "no_missing_required_artifacts",
          "four_plan_contract_complete",
          "snapshot_value_bytes_unchanged",
          "snapshot_value_audit_bytes_unchanged",
          "all_snapshot_detail_bytes_unchanged",
          "artifact_freshness_reverified",
          "resume_from_artifact_freshness_gate",
          "remote_head_race_guard_clean"
        ]
      },

      authority: {
        planningOnly:
          true,
        dryRunAuthorized:
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
        commitAuthorized:
          false,
        pushAuthorized:
          false,
        deployAuthorized:
          false,
        workflowMutationAuthorized:
          false,
        externalAuthorizationV2RequiredBeforeMutableExecution:
          true
      },

      existingAutonomousRepairPlanCompatibility: {
        reusedAsMutableExecutionPlan:
          false,

        reason:
          "freshness_repair_requires_a_manifest_only_adapter_that_preserves_value_and_detail_bytes;_the_current_full_snapshot_exporter_is_not_authorized_for_this_bounded_route"
      }
    };

    freshnessArtifact.contractFingerprint =
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        freshnessArtifact
      );

    return freshnessArtifact;
  }

  if (
    isDetailsOrphanRoute
  ) {
    const detailsOrphanArtifact = {
      schema:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

      version:
        "1.2.0",

      role:
        "read_only_bounded_repair_executor_contract",

      mode:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,

      dayKey,

      sourceDecision: {
        decisionFingerprint:
          text(
            decision
              .decisionFingerprint
          ),
        decisionState:
          decision
            .decisionState,
        failureClass:
          decision
            .failureClass,
        repairUnit:
          decision
            .repairUnit,
        resumeCheckpoint:
          decision
            .resumeCheckpoint
      },

      repairContract: {
        exactRepairUnit:
          DETAILS_ORPHAN_REPAIR_UNIT,

        purpose:
          "plan_deletion_of_only_hash_bound_source_detail_files_proven_extra_against_the_published_fixture_universe",

        planner: {
          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-details-orphan-cleanup-dry-run-day.js",

          verifier:
            "engine-v1/jobs/verify-details-value-mirror-day.js",

          requiredObservationContext:
            "daily_source_details_tree",

          repositoryMutationDuringDryRun:
            false
        },

        allowedRepositoryOperationAfterFutureAuthorization:
          "DELETE_ONLY",

        allowedRepositoryDeletionScopeAfterFutureAuthorization:
          `data/details/${dayKey}/<VERIFIED_HASH_BOUND_ORPHAN>.json`,

        outputScope:
          "DYNAMIC_EXACT_HASH_BOUND_CANDIDATE_PATHS_ONLY",

        explicitlyForbiddenDeletionScopes: [
          `data/deploy-snapshots/${dayKey}/details/`,
          "data/canonical-fixtures/",
          "data/value/",
          "data/value-plans/",
          "data/final-results/"
        ],

        forbiddenOperations: [
          "delete_snapshot_detail",
          "delete_expected_fixture_detail",
          "delete_without_candidate_sha256_match",
          "full_details_rebuild",
          "value_rebuild",
          "canonical_truth_mutation",
          "final_result_truth_mutation",
          "full_daily_cycle",
          "workflow_mutation",
          "commit",
          "push",
          "deploy"
        ],

        dryRun: {
          readOnly:
            true,

          exactCandidateEnumeration:
            true,

          sha256BindingRequired:
            true,

          filesystemDeletion:
            false,

          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-details-orphan-cleanup-dry-run-day.js"
        },

        postconditionsForFutureMutableExecution: [
          "candidate_path_is_under_source_details_day_only",
          "candidate_sha256_matches_predelete_plan",
          "candidate_remains_absent_from_fixture_expected_detail_set",
          "no_non_extra_details_mirror_violations_exist",
          "details_value_mirror_gate_reverified",
          "resume_from_details_value_mirror_gate",
          "remote_head_race_guard_clean"
        ]
      },

      authority: {
        planningOnly:
          true,
        dryRunAuthorized:
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
        commitAuthorized:
          false,
        pushAuthorized:
          false,
        deployAuthorized:
          false,
        workflowMutationAuthorized:
          false,
        externalAuthorizationV2RequiredBeforeMutableExecution:
          true
      },

      existingAutonomousRepairPlanCompatibility: {
        reusedAsMutableExecutionPlan:
          false,

        reason:
          "details_orphan_cleanup_requires_dynamic_exact_hash_bound_delete_candidates_and_must_not_borrow_broader_legacy_mutation_authority"
      }
    };

    detailsOrphanArtifact.contractFingerprint =
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        detailsOrphanArtifact
      );

    return detailsOrphanArtifact;
  }

  if (
    isPublicationInspectionRoute
  ) {
    const publicationArtifact = {
      schema:
        CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

      version:
        "1.1.0",

      role:
        "read_only_bounded_repair_executor_contract",

      mode:
        CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_MODE,

      dayKey,

      sourceDecision: {
        decisionFingerprint:
          text(
            decision
              .decisionFingerprint
          ),
        decisionState:
          decision
            .decisionState,
        failureClass:
          decision
            .failureClass,
        repairUnit:
          decision
            .repairUnit,
        resumeCheckpoint:
          decision
            .resumeCheckpoint
      },

      repairContract: {
        exactRepairUnit:
          CURRENT_DAY_PUBLICATION_REPAIR_UNIT,

        purpose:
          "inspect_persisted_current_day_publication_and_route_to_the_first_exact_failed_gate_without_mutation",

        inspector: {
          runner:
            "engine-v1/jobs/run-checkpoint-aware-targeted-publication-inspection-day.js",

          persistedArtifactsOnly:
            true,

          sourceDetailsTreeRequired:
            false
        },

        allowedRepositoryOutputsAfterFutureAuthorization:
          [],

        outputScope:
          "NO_REPOSITORY_OUTPUTS",

        forbiddenOperations: [
          "write_publication_artifact",
          "promote_latest_pointer",
          "rebuild_value_model",
          "rebuild_details",
          "mutate_canonical_fixture_truth",
          "mutate_final_result_truth",
          "dispatch_daily_workflow",
          "full_daily_cycle",
          "workflow_mutation",
          "commit",
          "push",
          "deploy"
        ],

        postconditions: [
          "publication_state_reobserved_from_persisted_artifacts",
          "first_failed_gate_classified_or_fail_closed_quarantine",
          "healthy_recheck_causes_no_action",
          "broad_daily_dispatch_remains_unauthorized"
        ]
      },

      authority: {
        planningOnly:
          true,
        readOnlyInspectionAuthorized:
          true,
        dryRunAuthorized:
          false,
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
        commitAuthorized:
          false,
        pushAuthorized:
          false,
        deployAuthorized:
          false,
        workflowMutationAuthorized:
          false,
        broadDailyDispatchAuthorized:
          false,
        externalAuthorizationV2RequiredBeforeMutableExecution:
          true
      },

      existingAutonomousRepairPlanCompatibility: {
        reusedAsMutableExecutionPlan:
          false,
        reason:
          "publication_inspection_is_read_only_and_must_not_inherit_legacy_broad_daily_recovery_authority"
      }
    };

    publicationArtifact.contractFingerprint =
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        publicationArtifact
      );

    return publicationArtifact;
  }

  const artifact = {
    schema:
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_bounded_repair_executor_contract",

    mode:
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,

    dayKey,

    sourceDecision: {
      decisionFingerprint:
        text(
          decision
            .decisionFingerprint
        ),
      decisionState:
        decision
          .decisionState,
      failureClass:
        decision
          .failureClass,
      repairUnit:
        decision
          .repairUnit,
      resumeCheckpoint:
        decision
          .resumeCheckpoint
    },

    repairContract: {
      exactRepairUnit:
        VALUE_COMPARISON_REPAIR_UNIT,

      purpose:
        "rebuild_only_the_day_value_comparison_and_its_cumulative_rollup",

      candidateBuilders: [
        {
          script:
            "engine-v1/jobs/build-value-plan-comparison-day.js",
          args: [
            `--date=${dayKey}`,
            "--write",
            "--output=<TEMP_COMPARISON_DIR>/<DAY>.json"
          ],
          repositoryWriteAllowed:
            false
        },
        {
          script:
            "engine-v1/jobs/build-value-comparison-cumulative.js",
          args: [
            "--write",
            "--dir=<TEMP_COMPARISON_DIR>",
            "--output=<TEMP_COMPARISON_DIR>/cumulative.json"
          ],
          repositoryWriteAllowed:
            false
        }
      ],

      allowedRepositoryOutputsAfterFutureAuthorization: [
        `data/value-comparison/${dayKey}.json`,
        "data/value-comparison/cumulative.json"
      ],

      outputScope:
        "EXACT_PATHS_ONLY",

      forbiddenRepositoryPrefixes: [
        ".github/",
        "engine-v1/",
        "assets/",
        "workers/",
        "data/canonical-fixtures/",
        "data/deploy-snapshots/",
        "data/details/",
        "data/value/",
        "data/value-plans/",
        "data/final-results/",
        "data/final-result-conflicts/"
      ],

      forbiddenOperations: [
        "rebuild_value_model",
        "rebuild_details",
        "rebuild_plan_a",
        "rebuild_plan_b",
        "mutate_canonical_fixture_truth",
        "mutate_final_result_truth",
        "full_daily_cycle",
        "workflow_mutation",
        "push",
        "deploy"
      ],

      dryRun: {
        tempOnly:
          true,
        tempCopyOfComparisonInputs:
          true,
        productionRepositoryMutation:
          false,
        cleanupRequired:
          true,
        runner:
          "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js"
      },

      postconditionsForFutureMutableExecution: [
        "day_comparison_builder_ok",
        "cumulative_builder_ok",
        "repository_diff_scope_exact_two_allowed_paths",
        "artifact_freshness_reverified",
        "resume_from_artifact_freshness_gate",
        "remote_head_race_guard_clean"
      ]
    },

    authority: {
      planningOnly:
        true,
      dryRunAuthorized:
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
      commitAuthorized:
        false,
      pushAuthorized:
        false,
      deployAuthorized:
        false,
      workflowMutationAuthorized:
        false,
      externalAuthorizationV2RequiredBeforeMutableExecution:
        true
    },

    existingAutonomousRepairPlanCompatibility: {
      reusedAsMutableExecutionPlan:
        false,
      reason:
        "legacy_autonomous_repair_plan_protects_value_comparison_paths;_checkpoint_executor_remains_separate_and_read_only_until_explicit_authorized_bridge_design"
    }
  };

  artifact.contractFingerprint =
    checkpointAwareTargetedRepairExecutorContractFingerprint(
      artifact
    );

  return artifact;
}
