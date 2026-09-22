import { createHash } from "node:crypto";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_CONTROLLER_DECISION_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-repair-controller-decision.v1";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_CONTROLLER_VERSION =
  "1.0.0";

export const EXECUTION_AUTHORIZATION_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-authorization.v2";

export const EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHMS =
  Object.freeze([
    "Ed25519",
    "ECDSA_P256_SHA256"
  ]);

export const BROAD_DAILY_RECOVERY_POLICY =
  "EXPLICIT_LAST_RESORT_ONLY_NOT_DEFAULT";

const DAY_RE =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

const UTC_MS_RE =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;

export const FAILURE_ROUTES =
  Object.freeze({
    ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST:
      Object.freeze({
        repairUnit:
          "rebuild_coverage_readiness_then_manifest_only_reexport_preserving_value_and_details",
        resumeCheckpoint:
          "artifact_freshness_gate",
        forbidden:
          Object.freeze([
            "value_rebuild",
            "details_rebuild",
            "full_daily_cycle"
          ])
      }),

    VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL:
      Object.freeze({
        repairUnit:
          "rebuild_day_value_comparison_and_cumulative_only",
        resumeCheckpoint:
          "artifact_freshness_gate",
        forbidden:
          Object.freeze([
            "value_model_rebuild",
            "details_rebuild",
            "full_daily_cycle"
          ])
      }),

    DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE:
      Object.freeze({
        repairUnit:
          "remove_only_verified_orphan_derived_detail_files",
        resumeCheckpoint:
          "details_value_mirror_gate",
        forbidden:
          Object.freeze([
            "full_details_rebuild",
            "value_rebuild",
            "full_daily_cycle"
          ])
      }),

    LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS:
      Object.freeze({
        repairUnit:
          "exact_provider_evidence_all_or_nothing_targeted_terminal_repair",
        resumeCheckpoint:
          "snapshot_reexport_then_downstream_gates",
        forbidden:
          Object.freeze([
            "heuristic_final_promotion",
            "unverified_status_write",
            "full_daily_cycle"
          ])
      }),

    CANONICAL_SUPPRESSED_ALIAS_PRESENT:
      Object.freeze({
        repairUnit:
          "resolver_membership_gate_suppression_only",
        resumeCheckpoint:
          "canonical_semantic_reverification_then_downstream",
        forbidden:
          Object.freeze([
            "fuzzy_identity_merge",
            "destructive_history_rewrite",
            "full_daily_cycle"
          ])
      }),

    CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING:
      Object.freeze({
        repairUnit:
          "inspect_existing_day_artifacts_and_route_to_exact_failed_gate",
        resumeCheckpoint:
          "first_failed_publication_gate",
        forbidden:
          Object.freeze([
            "automatic_full_daily_dispatch_as_default"
          ])
      })
  });

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            canonicalize(value[key])
          ]
        )
    );
  }

  return value;
}

function canonicalJson(value) {
  return JSON.stringify(
    canonicalize(value)
  );
}

function sha256Json(value) {
  return createHash("sha256")
    .update(
      canonicalJson(value),
      "utf8"
    )
    .digest("hex");
}

function normalizeSignal(signal) {
  if (
    typeof signal === "string"
  ) {
    return {
      code: signal.trim(),
      informational: false,
      details: {}
    };
  }

  if (
    !signal ||
    typeof signal !== "object" ||
    Array.isArray(signal)
  ) {
    return {
      code: "",
      informational: false,
      details: {}
    };
  }

  return {
    code:
      String(
        signal.code ?? ""
      ).trim(),

    informational:
      signal.informational === true ||
      String(
        signal.severity ?? ""
      ).toLowerCase() === "info",

    details:
      signal.details &&
      typeof signal.details === "object" &&
      !Array.isArray(signal.details)
        ? signal.details
        : {}
  };
}

function classifyOneSignal(signal) {
  const code =
    String(signal.code || "");

  const lower =
    code.toLowerCase();

  if (
    code ===
      "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST" ||
    lower ===
      "snapshot_stale_against_coverage_readiness" ||
    (
      lower ===
        "artifact_freshness_failure" &&
      String(
        signal.details?.reason ?? ""
      ).toLowerCase() ===
        "snapshot_stale_against_coverage_readiness"
    )
  ) {
    return "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST";
  }

  if (
    code ===
      "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL" ||
    lower ===
      "value_plan_comparison_stale_against_canonical"
  ) {
    return "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL";
  }

  if (
    code ===
      "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE" ||
    lower ===
      "source_detail_extra_file" ||
    (
      lower ===
        "details_value_mirror_violation" &&
      String(
        signal.details?.violationCode ?? ""
      ).toLowerCase() ===
        "source_detail_extra_file"
    )
  ) {
    return "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE";
  }

  if (
    code ===
      "LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS" ||
    lower.startsWith(
      "live_status_stale_open_exact_provider_ids:"
    )
  ) {
    return "LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS";
  }

  if (
    code ===
      "CANONICAL_SUPPRESSED_ALIAS_PRESENT" ||
    lower ===
      "canonical_suppressed_alias_present"
  ) {
    return "CANONICAL_SUPPRESSED_ALIAS_PRESENT";
  }

  if (
    code ===
      "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING" ||
    [
      "current_day_publication_pointer_missing",
      "current_day_publication_artifact_missing",
      "latest_pointer_missing",
      "current_manifest_missing"
    ].includes(lower)
  ) {
    return "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING";
  }

  return null;
}

export function classifyCheckpointAwareRepairSignals(
  signals = []
) {
  if (!Array.isArray(signals)) {
    throw new Error(
      "controller_signals_must_be_array"
    );
  }

  const recognized = [];
  const unknownActionable = [];
  const ignoredInformational = [];

  for (
    let index = 0;
    index < signals.length;
    index += 1
  ) {
    const normalized =
      normalizeSignal(
        signals[index]
      );

    if (
      normalized.informational
    ) {
      ignoredInformational.push({
        index,
        code:
          normalized.code
      });
      continue;
    }

    const failureClass =
      classifyOneSignal(
        normalized
      );

    if (failureClass) {
      recognized.push({
        index,
        code:
          normalized.code,
        failureClass
      });
    } else {
      unknownActionable.push({
        index,
        code:
          normalized.code ||
          "INVALID_OR_EMPTY_SIGNAL"
      });
    }
  }

  const failureClasses =
    [
      ...new Set(
        recognized.map(
          item =>
            item.failureClass
        )
      )
    ];

  return {
    recognized,
    failureClasses,
    unknownActionable,
    ignoredInformational
  };
}

function decisionBase({
  dayKey,
  generatedAt,
  expectedRemoteHead,
  observedRemoteHead,
  classification
}) {
  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_REPAIR_CONTROLLER_DECISION_SCHEMA,

    version:
      CHECKPOINT_AWARE_TARGETED_REPAIR_CONTROLLER_VERSION,

    role:
      "read_only_checkpoint_aware_targeted_repair_controller_decision",

    dayKey,
    generatedAt,

    remoteBinding: {
      expectedRemoteHead,
      observedRemoteHead,
      exact:
        expectedRemoteHead ===
        observedRemoteHead
    },

    classification,

    controllerInvariant:
      "never_restart_the_whole_daily_cycle_when_a_verified_downstream_checkpoint_exists",

    broadDailyRecoveryPolicy:
      BROAD_DAILY_RECOVERY_POLICY,

    authority: {
      artifactReadOnly:
        true,

      projectWriteAuthorized:
        false,

      filesystemWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      productionKernelEnableAuthorized:
        false,

      workflowMutationAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false,

      broadDailyRecoveryAuthorized:
        false
    },

    executionBoundary: {
      planningOnly:
        true,

      productionKernelEnabled:
        false,

      signedAuthorizationRequiredBeforeExecution:
        true,

      authorizationSchema:
        EXECUTION_AUTHORIZATION_SCHEMA,

      acceptedSignatureAlgorithms:
        [
          ...EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHMS
        ]
    }
  };
}

export function checkpointAwareTargetedRepairControllerDecisionFingerprint(
  artifact
) {
  const unsigned = {
    ...artifact
  };

  delete unsigned.decisionFingerprint;

  return sha256Json(
    unsigned
  );
}

export function buildCheckpointAwareTargetedRepairControllerDecision({
  dayKey,
  generatedAt,
  expectedRemoteHead,
  observedRemoteHead,
  signals = []
}) {
  if (
    !DAY_RE.test(
      String(dayKey || "")
    )
  ) {
    throw new Error(
      "controller_day_key_invalid"
    );
  }

  if (
    !UTC_MS_RE.test(
      String(generatedAt || "")
    )
  ) {
    throw new Error(
      "controller_generated_at_invalid"
    );
  }

  if (
    !SHA_RE.test(
      String(
        expectedRemoteHead || ""
      )
    ) ||
    !SHA_RE.test(
      String(
        observedRemoteHead || ""
      )
    )
  ) {
    throw new Error(
      "controller_remote_head_invalid"
    );
  }

  const classification =
    classifyCheckpointAwareRepairSignals(
      signals
    );

  let decisionState;
  let failureClass = null;
  let repairUnit = null;
  let resumeCheckpoint = null;
  let forbidden = [];
  let quarantineReason = null;

  if (
    expectedRemoteHead !==
      observedRemoteHead
  ) {
    decisionState =
      "FAIL_CLOSED_REPLAN";

    quarantineReason =
      "remote_code_or_data_head_drift_during_repair";
  } else if (
    classification
      .unknownActionable
      .length > 0
  ) {
    decisionState =
      "FAIL_CLOSED_QUARANTINE";

    quarantineReason =
      "unknown_actionable_failure_signal";
  } else if (
    classification
      .failureClasses
      .length > 1
  ) {
    decisionState =
      "FAIL_CLOSED_QUARANTINE";

    quarantineReason =
      "multiple_conflicting_failure_classes";
  } else if (
    classification
      .failureClasses
      .length === 0
  ) {
    decisionState =
      "NO_REPAIR_REQUIRED";
  } else {
    failureClass =
      classification
        .failureClasses[0];

    const route =
      FAILURE_ROUTES[
        failureClass
      ];

    repairUnit =
      route.repairUnit;

    resumeCheckpoint =
      route.resumeCheckpoint;

    forbidden =
      [
        ...route.forbidden
      ];

    decisionState =
      failureClass ===
        "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING"
        ? "READ_ONLY_INSPECTION_PLAN"
        : "BOUNDED_REPAIR_PLAN";
  }

  const artifact =
    decisionBase({
      dayKey,
      generatedAt,
      expectedRemoteHead,
      observedRemoteHead,
      classification
    });

  Object.assign(
    artifact,
    {
      decisionState,
      failureClass,
      repairUnit,
      resumeCheckpoint,
      forbidden,
      quarantineReason,

      checkpointContract: {
        checkpointAware:
          true,

        resumeFromVerifiedCheckpoint:
          true,

        checkpointVerificationRequiredBeforeExecution:
          decisionState ===
            "BOUNDED_REPAIR_PLAN"
      },

      executionAuthorization: {
        requiredBeforeBoundedExecution:
          decisionState ===
            "BOUNDED_REPAIR_PLAN",

        authorizationGrantedByThisDecision:
          false,

        authorizationArtifactReadOnly:
          true
      }
    }
  );

  artifact.decisionFingerprint =
    checkpointAwareTargetedRepairControllerDecisionFingerprint(
      artifact
    );

  return artifact;
}
