export const CHECKPOINT_AWARE_TARGETED_FRESHNESS_COVERAGE_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-freshness-coverage-readiness-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const EXACT_REASON =
  "snapshot_stale_against_coverage_readiness";

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function uniqueSorted(values) {
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
      CHECKPOINT_AWARE_TARGETED_FRESHNESS_COVERAGE_PLAN_SCHEMA,

    dayKey,

    planState,

    reason:
      reason || null,

    exactFailureClass:
      "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST",

    exactRepairUnit:
      "rebuild_coverage_readiness_then_manifest_only_reexport_preserving_value_and_details",

    mutableBridgeStatus:
      "NOT_AUTHORIZED_MANIFEST_ONLY_ADAPTER_REQUIRED",

    allowedRepositoryOutputsAfterFutureAuthorization: [
      `data/coverage-readiness/${dayKey}.json`,
      `data/deploy-snapshots/${dayKey}/manifest.json`,
      `data/deploy-snapshots/${dayKey}/freshness-report.json`
    ],

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

    safety: {
      readOnly:
        true,

      repositoryWritePerformed:
        false,

      manifestWritePerformed:
        false,

      coverageReadinessWritePerformed:
        false,

      freshnessReportWritePerformed:
        false,

      detailsWritePerformed:
        false,

      valueWritePerformed:
        false
    }
  };
}

export function classifyCheckpointAwareFreshnessCoverageReadinessPlan({
  dayKey,
  freshness
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
      "freshness_coverage_plan_day_invalid"
    );
  }

  if (
    !freshness ||
    typeof freshness !==
      "object" ||
    Array.isArray(
      freshness
    )
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "SOURCE_REPORT_UNAVAILABLE_NO_ACTION",

      reason:
        "freshness_report_unavailable"
    });
  }

  const reasons =
    uniqueSorted(
      freshness.reasons
    );

  const staleInputs =
    Array.isArray(
      freshness.staleInputs
    )
      ? freshness.staleInputs
      : [];

  const staleDerived =
    Array.isArray(
      freshness.staleDerivedArtifacts
    )
      ? freshness.staleDerivedArtifacts
      : [];

  const missingRequired =
    Array.isArray(
      freshness.missingRequiredArtifacts
    )
      ? freshness.missingRequiredArtifacts
      : [];

  if (
    freshness.ok ===
      true &&
    reasons.length ===
      0 &&
    staleInputs.length ===
      0 &&
    staleDerived.length ===
      0 &&
    missingRequired.length ===
      0
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "NO_REPAIR_REQUIRED",

      reason:
        "artifact_freshness_already_clean"
    });
  }

  const exactReasonOnly =
    reasons.length ===
      1 &&
    reasons[0] ===
      EXACT_REASON;

  const exactInputOnly =
    staleInputs.length ===
      1 &&
    clean(
      staleInputs[0]?.kind
    ) ===
      "coverage_readiness" &&
    clean(
      staleInputs[0]?.staleReason
    ) ===
      EXACT_REASON &&
    clean(
      staleInputs[0]?.artifact
    ) ===
      `coverage-readiness/${day}.json` &&
    Number(
      staleInputs[0]
        ?.newerThanManifestMs
    ) >
      0;

  const fourPlanComplete =
    freshness
      ?.fourPlanContract
      ?.complete ===
        true;

  if (
    !exactReasonOnly ||
    !exactInputOnly ||
    staleDerived.length !==
      0 ||
    missingRequired.length !==
      0 ||
    !fourPlanComplete
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_FRESHNESS_STATE",

        reason:
          "freshness_failure_not_exact_coverage_readiness_only"
      }),

      observation: {
        reasons,
        staleInputKinds:
          staleInputs.map(
            row =>
              clean(
                row?.kind
              )
          ),
        staleInputReasons:
          staleInputs.map(
            row =>
              clean(
                row?.staleReason
              )
          ),
        staleDerivedCount:
          staleDerived.length,
        missingRequiredCount:
          missingRequired.length,
        fourPlanComplete
      }
    };
  }

  return {
    ...basePlan({
      dayKey:
        day,

      planState:
        "EXACT_COVERAGE_READINESS_REPAIR_PLAN",

      reason:
        "coverage_readiness_is_the_only_input_newer_than_manifest"
    }),

    observation: {
      manifestGeneratedAt:
        freshness
          ?.manifestGeneratedAt ||
        null,

      coverageReadiness:
        {
          artifact:
            staleInputs[0]
              .artifact,

          at:
            staleInputs[0]
              ?.at ||
            null,

          newerThanManifestMs:
            Number(
              staleInputs[0]
                ?.newerThanManifestMs
            )
        },

      staleDerivedCount:
        0,

      missingRequiredCount:
        0,

      fourPlanComplete:
        true
    },

    futureExecutionRecipe: [
      {
        order:
          1,

        operation:
          "REBUILD_COVERAGE_READINESS_ONLY",

        producer:
          "engine-v1/jobs/build-league-gap-report-day.js",

        output:
          `data/coverage-readiness/${day}.json`
      },

      {
        order:
          2,

        operation:
          "MANIFEST_ONLY_REEXPORT_FROM_EXISTING_SNAPSHOT_BYTES",

        producer:
          "DEDICATED_MANIFEST_ONLY_ADAPTER_REQUIRED",

        output:
          `data/deploy-snapshots/${day}/manifest.json`,

        preserveValueBytes:
          true,

        preserveValueAuditBytes:
          true,

        preserveAllSnapshotDetailBytes:
          true,

        fullSnapshotExporterAuthorized:
          false
      },

      {
        order:
          3,

        operation:
          "REVERIFY_ARTIFACT_FRESHNESS",

        verifier:
          "engine-v1/jobs/verify-artifact-freshness-day.js",

        output:
          `data/deploy-snapshots/${day}/freshness-report.json`
      }
    ]
  };
}
