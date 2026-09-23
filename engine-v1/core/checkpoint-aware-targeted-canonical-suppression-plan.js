export const CHECKPOINT_AWARE_TARGETED_CANONICAL_SUPPRESSION_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-canonical-suppression-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function sortedUnique(values) {
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

function basePlan({
  dayKey,
  planState,
  reason
}) {
  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_CANONICAL_SUPPRESSION_PLAN_SCHEMA,

    dayKey,

    planState,

    reason:
      reason || null,

    exactFailureClass:
      "CANONICAL_SUPPRESSED_ALIAS_PRESENT",

    exactRepairUnit:
      "resolver_membership_gate_suppression_only",

    mutableBridgeStatus:
      "FAILED_CONSUMER_TARGET_REQUIRED_BEFORE_EXECUTION",

    allowedRepositoryOutputsAfterFutureAuthorization:
      [],

    outputScope:
      "NO_REPOSITORY_OUTPUTS_UNTIL_FAILED_CONSUMER_TARGET_IDENTIFIED",

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

    safety: {
      readOnly:
        true,

      repositoryWritePerformed:
        false,

      canonicalFixtureMutationPerformed:
        false,

      resolverLedgerMutationPerformed:
        false,

      historyMutationPerformed:
        false
    }
  };
}

export function classifyCheckpointAwareCanonicalSuppressionPlan({
  dayKey,
  observation,
  resolver = null
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
      "canonical_suppression_plan_day_invalid"
    );
  }

  if (
    !observation ||
    typeof observation !==
      "object" ||
    Array.isArray(
      observation
    )
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "SOURCE_OBSERVATION_UNAVAILABLE_NO_ACTION",

      reason:
        "canonical_identity_observation_missing"
    });
  }

  if (
    observation
      .observationAvailable !==
        true
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "SOURCE_OBSERVATION_UNAVAILABLE_NO_ACTION",

      reason:
        clean(
          observation.reason
        ) ||
        "canonical_identity_observation_unavailable"
    });
  }

  const readError =
    clean(
      observation.readError
    );

  if (
    readError
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_IDENTITY_STATE",

        reason:
          "canonical_identity_observer_error"
      }),

      readError
    };
  }

  const rawIds =
    sortedUnique(
      observation
        .rawSuppressedFixtureIds
    );

  const leakedIds =
    sortedUnique(
      observation
        .postGateSuppressedFixtureIds
    );

  if (
    leakedIds.length ===
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "NO_REPAIR_REQUIRED",

        reason:
          rawIds.length > 0
            ? "raw_suppressed_aliases_removed_before_effective_canonical_universe"
            : "canonical_identity_membership_fixed_point_clean"
      }),

      observation: {
        rawSuppressedAliasCount:
          rawIds.length,

        postGateSuppressedAliasCount:
          0,

        rawSuppressedFixtureIds:
          rawIds,

        postGateSuppressedFixtureIds:
          []
      }
    };
  }

  if (
    !resolver ||
    typeof resolver
      .resolveFixtureId !==
      "function"
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_IDENTITY_STATE",

        reason:
          "production_identity_resolver_required_for_leak_classification"
      }),

      observation: {
        rawSuppressedFixtureIds:
          rawIds,

        postGateSuppressedFixtureIds:
          leakedIds
      }
    };
  }

  const resolutions =
    [];

  for (
    const fixtureId of
      leakedIds
  ) {
    const resolution =
      resolver.resolveFixtureId(
        fixtureId
      );

    if (
      !resolution?.ok
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_IDENTITY_STATE",

          reason:
            "leaked_fixture_id_not_resolved_by_production_identity_resolver"
        }),

        failingFixtureId:
          fixtureId,

        resolutionStatus:
          clean(
            resolution?.status
          ) ||
          "unknown"
      };
    }

    if (
      resolution
        .sourceRole !==
        "suppressed_lineage_alias"
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_IDENTITY_STATE",

          reason:
            "leaked_fixture_id_not_classified_as_suppressed_lineage_alias"
        }),

        failingFixtureId:
          fixtureId,

        sourceRole:
          clean(
            resolution
              .sourceRole
          ) ||
          null
      };
    }

    const resolvedFixtureId =
      clean(
        resolution
          .resolvedFixtureId
      );

    if (
      !resolvedFixtureId
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_IDENTITY_STATE",

          reason:
            "suppressed_alias_missing_retained_resolution_target"
        }),

        failingFixtureId:
          fixtureId
      };
    }

    resolutions.push({
      fixtureId,

      sourceRole:
        resolution
          .sourceRole,

      resolvedFixtureId
    });
  }

  return {
    ...basePlan({
      dayKey:
        day,

      planState:
        "EXACT_SUPPRESSION_PROJECTION_PLAN",

      reason:
        "post_gate_ids_are_exact_production_resolver_suppressed_aliases"
    }),

    observation: {
      rawSuppressedAliasCount:
        rawIds.length,

      postGateSuppressedAliasCount:
        leakedIds.length,

      rawSuppressedFixtureIds:
        rawIds,

      postGateSuppressedFixtureIds:
        leakedIds
    },

    resolutionEvidence:
      resolutions,

    futureExecutionRecipe: [
      {
        order:
          1,

        operation:
          "IDENTIFY_EXACT_FAILED_CANONICAL_CONSUMER",

        status:
          "REQUIRED_BEFORE_MUTABLE_EXECUTION"
      },

      {
        order:
          2,

        operation:
          "REAPPLY_PRODUCTION_IDENTITY_MEMBERSHIP_GATE_TO_FAILED_CONSUMER_PROJECTION_ONLY",

        sourceTruthMutation:
          false,

        canonicalPartitionRewrite:
          false,

        resolverLedgerMutation:
          false
      },

      {
        order:
          3,

        operation:
          "REVERIFY_CANONICAL_SEMANTIC_FIXED_POINT",

        requiredPostGateSuppressedAliasCount:
          0
      },

      {
        order:
          4,

        operation:
          "RESUME_CANONICAL_SEMANTIC_REVERIFICATION_THEN_DOWNSTREAM"
      }
    ]
  };
}
