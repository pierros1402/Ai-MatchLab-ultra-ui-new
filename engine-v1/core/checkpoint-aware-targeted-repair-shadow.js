import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "./checkpoint-aware-targeted-repair-controller.js";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-repair-shadow.v1";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_MODE =
  "OBSERVATION_ONLY";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_REMOTE_BINDING_MODE =
  "single_remote_observation_non_authorizing";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_WIRED_FAILURE_CLASSES =
  Object.freeze([
    "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST",
    "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL",
    "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE",
    "LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS",
    "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING"
  ]);

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES =
  Object.freeze([
    "CANONICAL_SUPPRESSED_ALIAS_PRESENT"
  ]);

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function text(value) {
  return String(value ?? "").trim();
}

function addUniqueSignal(
  signals,
  seen,
  signal
) {
  const value =
    text(signal);

  if (
    !value ||
    seen.has(value)
  ) {
    return;
  }

  seen.add(value);
  signals.push(value);
}

function freshnessReasons(
  freshness
) {
  const out = [];

  for (
    const reason of
      freshness?.reasons || []
  ) {
    out.push(
      text(reason)
    );
  }

  for (
    const row of
      freshness?.staleInputs || []
  ) {
    out.push(
      text(
        row?.staleReason
      )
    );
  }

  for (
    const row of
      freshness?.staleDerivedArtifacts || []
  ) {
    out.push(
      text(
        row?.staleReason
      )
    );
  }

  return new Set(
    out.filter(Boolean)
  );
}

export function collectCheckpointAwareTargetedRepairShadowSignals({
  dayKey,
  currentDayKey,
  manifest = null,
  freshness = null,
  buildReport = null,
  detailsMirror = null
} = {}) {
  const signals = [];
  const seen =
    new Set();

  if (
    text(dayKey) ===
      text(currentDayKey) &&
    !manifest
  ) {
    addUniqueSignal(
      signals,
      seen,
      "current_manifest_missing"
    );
  }

  const freshReasons =
    freshnessReasons(
      freshness
    );

  if (
    freshReasons.has(
      "snapshot_stale_against_coverage_readiness"
    )
  ) {
    addUniqueSignal(
      signals,
      seen,
      "snapshot_stale_against_coverage_readiness"
    );
  }

  if (
    freshReasons.has(
      "value_plan_comparison_stale_against_canonical"
    )
  ) {
    addUniqueSignal(
      signals,
      seen,
      "value_plan_comparison_stale_against_canonical"
    );
  }

  for (
    const failure of
      buildReport?.hardFailures || []
  ) {
    const raw =
      text(failure);

    if (
      raw.startsWith(
        "live_status_stale_open_exact_provider_ids:"
      )
    ) {
      addUniqueSignal(
        signals,
        seen,
        raw
      );
    }
  }

  const mirrorViolations =
    Array.isArray(
      detailsMirror?.violations
    )
      ? detailsMirror.violations
      : [];

  if (
    mirrorViolations.some(
      violation =>
        text(
          violation?.code
        ) ===
          "source_detail_extra_file"
    )
  ) {
    addUniqueSignal(
      signals,
      seen,
      "source_detail_extra_file"
    );
  }

  return signals;
}

export function buildCheckpointAwareTargetedRepairShadow({
  dayKey,
  currentDayKey,
  generatedAt,
  remoteHead,
  manifest = null,
  freshness = null,
  buildReport = null,
  detailsMirror = null
} = {}) {
  const signals =
    collectCheckpointAwareTargetedRepairShadowSignals({
      dayKey,
      currentDayKey,
      manifest,
      freshness,
      buildReport,
      detailsMirror
    });

  const normalizedRemoteHead =
    text(remoteHead)
      .toLowerCase();

  const base = {
    schema:
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_SCHEMA,

    mode:
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_MODE,

    dayKey:
      text(dayKey),

    generatedAt:
      text(generatedAt),

    executionAuthoritative:
      false,

    remoteBindingMode:
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_REMOTE_BINDING_MODE,

    remoteBindingIndependent:
      false,

    routeCoverage: {
      wiredFailureClasses:
        [
          ...CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_WIRED_FAILURE_CLASSES
        ],

      unwiredFailureClasses:
        [
          ...CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES
        ],

      wiredCount:
        CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_WIRED_FAILURE_CLASSES
          .length,

      totalControllerFailureClasses:
        CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_WIRED_FAILURE_CLASSES
          .length +
        CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES
          .length
    },

    signals
  };

  if (
    !SHA_RE.test(
      normalizedRemoteHead
    )
  ) {
    return {
      ...base,
      evaluated:
        false,
      reason:
        "remote_head_missing_or_invalid",
      observedRemoteHead:
        normalizedRemoteHead ||
        null,
      controllerDecision:
        null
    };
  }

  const controllerDecision =
    buildCheckpointAwareTargetedRepairControllerDecision({
      dayKey:
        text(dayKey),
      generatedAt:
        text(generatedAt),
      expectedRemoteHead:
        normalizedRemoteHead,
      observedRemoteHead:
        normalizedRemoteHead,
      signals
    });

  return {
    ...base,
    evaluated:
      true,
    reason:
      null,
    observedRemoteHead:
      normalizedRemoteHead,
    controllerDecision
  };
}
