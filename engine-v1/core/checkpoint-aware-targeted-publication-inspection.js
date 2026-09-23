export const CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-publication-inspection.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const GATE_PRIORITY =
  Object.freeze({
    SNAPSHOT_VERIFICATION_GATE:
      10,

    ARTIFACT_FRESHNESS_GATE:
      20,

    DETAILS_VALUE_MIRROR_GATE:
      30,

    INVARIANT_GATE:
      40,

    VALUE_ARTIFACT_GATE:
      50,

    FOUNDATION_INTEGRITY_GATE:
      60,

    VALUE_RELEASE_CONTRACT_GATE:
      70,

    BUILD_REPORT_GATE:
      80,

    SYSTEM_HEALTH_GATE:
      90,

    LATEST_POINTER_GATE:
      100
  });

function text(value) {
  return String(
    value ?? ""
  ).trim();
}

function gateForRequiredArtifact(
  artifact
) {
  switch (
    text(artifact)
  ) {
    case "manifest":
    case "fixtures":
    case "planCShadow":
    case "planCShadowAudit":
      return "SNAPSHOT_VERIFICATION_GATE";

    case "freshness":
      return "ARTIFACT_FRESHNESS_GATE";

    case "invariant":
      return "INVARIANT_GATE";

    case "value":
    case "valueAudit":
      return "VALUE_ARTIFACT_GATE";

    case "foundationIntegrity":
      return "FOUNDATION_INTEGRITY_GATE";

    case "planA":
    case "planA2":
    case "planB":
    case "planB2":
    case "valueComparison":
      return "VALUE_RELEASE_CONTRACT_GATE";

    case "buildReport":
      return "BUILD_REPORT_GATE";

    case "systemHealth":
      return "SYSTEM_HEALTH_GATE";

    default:
      return null;
  }
}

export function publicationGateForBlocker(
  blocker
) {
  const code =
    text(
      blocker?.code
    );

  if (
    code ===
      "required_artifact_missing" ||
    code ===
      "required_artifact_invalid_json"
  ) {
    return gateForRequiredArtifact(
      blocker?.artifact
    );
  }

  if (
    [
      "manifest_release_contract_failed",
      "manifest_day_mismatch",
      "plan_c_shadow_release_contract_failed",
      "plan_c_shadow_count_mismatch",
      "plan_c_shadow_pick_count_mismatch",
      "plan_c_shadow_audit_contract_failed",
      "fixtures_day_mismatch",
      "details_missing_for_nonempty_fixture_universe"
    ]
      .includes(
        code
      )
  ) {
    return "SNAPSHOT_VERIFICATION_GATE";
  }

  if (
    code ===
      "freshness_not_ok"
  ) {
    return "ARTIFACT_FRESHNESS_GATE";
  }

  if (
    code ===
      "details_value_mirror_failed"
  ) {
    return "DETAILS_VALUE_MIRROR_GATE";
  }

  if (
    [
      "invariant_not_ok",
      "invariant_value_not_safe",
      "invariant_manifest_stale"
    ]
      .includes(
        code
      )
  ) {
    return "INVARIANT_GATE";
  }

  if (
    [
      "value_picks_not_array",
      "value_source_missing_local_file",
      "value_count_mismatch",
      "value_audit_not_ok"
    ]
      .includes(
        code
      )
  ) {
    return "VALUE_ARTIFACT_GATE";
  }

  if (
    [
      "foundation_integrity_day_mismatch",
      "foundation_model_not_ready",
      "foundation_publication_not_ready"
    ]
      .includes(
        code
      )
  ) {
    return "FOUNDATION_INTEGRITY_GATE";
  }

  if (
    [
      "value_plan_release_contract_failed",
      "value_comparison_release_contract_failed"
    ]
      .includes(
        code
      )
  ) {
    return "VALUE_RELEASE_CONTRACT_GATE";
  }

  if (
    [
      "build_report_not_ok",
      "build_report_not_clean",
      "build_report_hard_failures_invalid",
      "build_report_has_hard_failures"
    ]
      .includes(
        code
      )
  ) {
    return "BUILD_REPORT_GATE";
  }

  if (
    [
      "system_health_day_mismatch",
      "system_health_error_count_invalid",
      "system_health_has_errors",
      "system_health_severity_error"
    ]
      .includes(
        code
      )
  ) {
    return "SYSTEM_HEALTH_GATE";
  }

  if (
    [
      "latest_invalid_json",
      "latest_missing",
      "latest_day_mismatch",
      "latest_manifest_hash_mismatch"
    ]
      .includes(
        code
      )
  ) {
    return "LATEST_POINTER_GATE";
  }

  return null;
}

function normalizedBlocked(
  report
) {
  return Array.isArray(
    report?.blocked
  )
    ? report.blocked
    : [];
}

export function classifyCheckpointAwareTargetedPublicationInspection({
  dayKey,
  prepublish,
  final
} = {}) {
  const day =
    text(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "publication_inspection_day_key_invalid"
    );
  }

  if (
    !prepublish ||
    typeof prepublish !==
      "object" ||
    !final ||
    typeof final !==
      "object"
  ) {
    throw new Error(
      "publication_inspection_contract_reports_required"
    );
  }

  if (
    prepublish.ok ===
      true &&
    final.ok ===
      true
  ) {
    return {
      schema:
        CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_SCHEMA,

      dayKey:
        day,

      inspectionState:
        "STALE_TRIGGER_NO_ACTION",

      reason:
        "publication_contract_already_healthy",

      firstFailedGate:
        null,

      primaryBlocker:
        null,

      classifiedBlockers:
        [],

      unclassifiedBlockers:
        [],

      broadDailyDispatchAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      repositoryMutationAuthorized:
        false
    };
  }

  const sourceMode =
    prepublish.ok ===
      true
      ? "final"
      : "prepublish";

  const blockers =
    sourceMode ===
      "prepublish"
      ? normalizedBlocked(
          prepublish
        )
      : normalizedBlocked(
          final
        );

  const classified =
    blockers.map(
      (
        blocker,
        index
      ) => ({
        index,
        blocker,
        gate:
          publicationGateForBlocker(
            blocker
          )
      })
    );

  const unclassified =
    classified.filter(
      row =>
        !row.gate
    );

  if (
    unclassified.length >
      0
  ) {
    return {
      schema:
        CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_SCHEMA,

      dayKey:
        day,

      inspectionState:
        "FAIL_CLOSED_QUARANTINE",

      reason:
        "unclassified_publication_blocker",

      sourceMode,

      firstFailedGate:
        null,

      primaryBlocker:
        null,

      classifiedBlockers:
        classified.filter(
          row =>
            row.gate
        ),

      unclassifiedBlockers:
        unclassified,

      broadDailyDispatchAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      repositoryMutationAuthorized:
        false
    };
  }

  if (
    classified.length ===
      0
  ) {
    return {
      schema:
        CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_SCHEMA,

      dayKey:
        day,

      inspectionState:
        "FAIL_CLOSED_QUARANTINE",

      reason:
        "publication_contract_failed_without_blockers",

      sourceMode,

      firstFailedGate:
        null,

      primaryBlocker:
        null,

      classifiedBlockers:
        [],

      unclassifiedBlockers:
        [],

      broadDailyDispatchAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      repositoryMutationAuthorized:
        false
    };
  }

  const ordered =
    [
      ...classified
    ]
      .sort(
        (left, right) => {
          const gateDelta =
            Number(
              GATE_PRIORITY[
                left.gate
              ] ||
              Number.MAX_SAFE_INTEGER
            ) -
            Number(
              GATE_PRIORITY[
                right.gate
              ] ||
              Number.MAX_SAFE_INTEGER
            );

          if (
            gateDelta !==
              0
          ) {
            return gateDelta;
          }

          return (
            left.index -
            right.index
          );
        }
      );

  const primary =
    ordered[0];

  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_SCHEMA,

    dayKey:
      day,

    inspectionState:
      "ROUTE_TO_FAILED_GATE",

    reason:
      "publication_contract_failure_classified",

    sourceMode,

    firstFailedGate:
      primary.gate,

    primaryBlocker:
      primary.blocker,

    classifiedBlockers:
      ordered,

    unclassifiedBlockers:
      [],

    broadDailyDispatchAuthorized:
      false,

    repairExecutionAuthorized:
      false,

    repositoryMutationAuthorized:
      false
  };
}
