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
    "CANONICAL_SUPPRESSED_ALIAS_PRESENT",
    "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING"
  ]);

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES =
  Object.freeze([]);

export const CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT =
  Object.freeze({
    DAILY:
      "daily",
    INTRADAY:
      "intraday",
    STATIC:
      "static"
  });

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

export function evaluatePublishedDetailsParity({
  manifest = null,
  fixtures = null,
  detailFiles = null,
  observationAvailable = true,
  reason = null
} = {}) {
  if (
    observationAvailable !==
      true
  ) {
    return {
      observationAvailable:
        false,
      ok:
        null,
      reason:
        text(reason) ||
        "published_snapshot_unavailable",
      violations:
        [],
      counts: {
        fixtures:
          null,
        publishedFixtureIds:
          null,
        detailFiles:
          null
      }
    };
  }

  const fixtureRows =
    Array.isArray(fixtures)
      ? fixtures
      : [];

  const publishedIds =
    fixtureRows
      .map(
        fixture =>
          text(
            fixture?.canonicalId ||
            fixture?.matchId
          )
      )
      .filter(Boolean);

  const publishedIdSet =
    new Set(
      publishedIds
    );

  const normalizedDetailFiles =
    (
      Array.isArray(detailFiles)
        ? detailFiles
        : []
    )
      .map(
        file =>
          text(file)
            .replace(
              /\.json$/u,
              ""
            )
      )
      .filter(Boolean)
      .sort();

  const detailSet =
    new Set(
      normalizedDetailFiles
    );

  const violations = [];

  const duplicatePublishedIds =
    publishedIds.filter(
      (id, index) =>
        publishedIds.indexOf(id) !==
          index
    );

  if (
    duplicatePublishedIds.length >
      0
  ) {
    violations.push({
      code:
        "published_fixture_identity_not_unique",
      count:
        new Set(
          duplicatePublishedIds
        ).size
    });
  }

  const detailsWithoutFixture =
    [
      ...detailSet
    ]
      .filter(
        id =>
          !publishedIdSet.has(
            id
          )
      )
      .sort();

  const fixturesWithoutDetail =
    [
      ...publishedIdSet
    ]
      .filter(
        id =>
          !detailSet.has(
            id
          )
      )
      .sort();

  if (
    detailsWithoutFixture.length >
      0 ||
    fixturesWithoutDetail.length >
      0
  ) {
    violations.push({
      code:
        "published_details_fixtures_not_bijective",
      publishedFixtures:
        publishedIdSet.size,
      detailFiles:
        detailSet.size,
      detailsWithoutFixture,
      fixturesWithoutDetail
    });
  }

  const manifestMissingDetails =
    Array.isArray(
      manifest
        ?.detailsMissingForFixtures
    )
      ? manifest
          .detailsMissingForFixtures
          .map(text)
          .filter(Boolean)
      : [];

  if (
    manifestMissingDetails.length >
      0
  ) {
    violations.push({
      code:
        "manifest_reports_fixtures_missing_details",
      count:
        manifestMissingDetails.length,
      fixtures:
        manifestMissingDetails
    });
  }

  const manifestDetailCount =
    Number(
      manifest
        ?.counts
        ?.details
    );

  if (
    !Number.isFinite(
      manifestDetailCount
    ) ||
    manifestDetailCount !==
      detailSet.size ||
    manifestDetailCount !==
      publishedIdSet.size
  ) {
    violations.push({
      code:
        "manifest_published_detail_count_mismatch",
      manifestDetails:
        Number.isFinite(
          manifestDetailCount
        )
          ? manifestDetailCount
          : null,
      publishedFixtures:
        publishedIdSet.size,
      detailFiles:
        detailSet.size
    });
  }

  return {
    observationAvailable:
      true,
    ok:
      violations.length === 0,
    reason:
      null,
    violations,
    counts: {
      fixtures:
        fixtureRows.length,
      publishedFixtureIds:
        publishedIdSet.size,
      detailFiles:
        detailSet.size
    }
  };
}

export function evaluateCanonicalSuppressedAliasObservation({
  observationAvailable = true,
  rawSuppressedFixtureIds = [],
  postGateSuppressedFixtureIds = [],
  readError = null,
  reason = null
} = {}) {
  const normalizeIds =
    values =>
      [
        ...new Set(
          (
            Array.isArray(values)
              ? values
              : []
          )
            .map(text)
            .filter(Boolean)
        )
      ]
        .sort();

  const rawIds =
    normalizeIds(
      rawSuppressedFixtureIds
    );

  const leakedIds =
    normalizeIds(
      postGateSuppressedFixtureIds
    );

  const normalizedReadError =
    text(
      readError
    );

  if (
    observationAvailable !==
      true
  ) {
    return {
      observationAvailable:
        false,
      ok:
        null,
      reason:
        text(reason) ||
        "canonical_identity_observation_unavailable",
      readError:
        normalizedReadError ||
        null,
      rawSuppressedFixtureIds:
        rawIds,
      postGateSuppressedFixtureIds:
        leakedIds,
      rawSuppressedAliasCount:
        rawIds.length,
      postGateSuppressedAliasCount:
        leakedIds.length
    };
  }

  return {
    observationAvailable:
      true,
    ok:
      !normalizedReadError &&
      leakedIds.length === 0,
    reason:
      normalizedReadError
        ? "canonical_suppressed_alias_observation_failed"
        : (
            leakedIds.length > 0
              ? "canonical_suppressed_alias_present_after_membership_gate"
              : null
          ),
    readError:
      normalizedReadError ||
      null,
    rawSuppressedFixtureIds:
      rawIds,
    postGateSuppressedFixtureIds:
      leakedIds,
    rawSuppressedAliasCount:
      rawIds.length,
    postGateSuppressedAliasCount:
      leakedIds.length
  };
}

export function collectCheckpointAwareTargetedRepairShadowSignals({
  dayKey,
  currentDayKey,
  manifest = null,
  freshness = null,
  buildReport = null,
  detailsMirror = null,
  publishedDetailsParity = null,
  canonicalSuppressedAliasObservation = null
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

  if (
    canonicalSuppressedAliasObservation
      ?.observationAvailable ===
        true
  ) {
    const canonicalReadError =
      text(
        canonicalSuppressedAliasObservation
          ?.readError
      );

    if (
      canonicalReadError
    ) {
      addUniqueSignal(
        signals,
        seen,
        "canonical_suppressed_alias_observation_failed"
      );
    }
    else if (
      canonicalSuppressedAliasObservation
        ?.ok ===
          false &&
      Number(
        canonicalSuppressedAliasObservation
          ?.postGateSuppressedAliasCount ||
        0
      ) > 0
    ) {
      addUniqueSignal(
        signals,
        seen,
        "canonical_suppressed_alias_present"
      );
    }
  }

  if (
    publishedDetailsParity
      ?.observationAvailable ===
        true &&
    publishedDetailsParity
      ?.ok ===
        false
  ) {
    const parityCodes =
      [
        ...new Set(
          (
            publishedDetailsParity
              ?.violations || []
          )
            .map(
              violation =>
                text(
                  violation?.code
                )
            )
            .filter(Boolean)
        )
      ]
        .sort();

    addUniqueSignal(
      signals,
      seen,
      "published_details_parity_failure:" +
        (
          parityCodes.join(",") ||
          "unknown"
        )
    );
  }

  if (
    detailsMirror
      ?.observationAvailable ===
        false
  ) {
    return signals;
  }

  const mirrorReadError =
    text(
      detailsMirror
        ?.readError
    );

  if (
    mirrorReadError
  ) {
    addUniqueSignal(
      signals,
      seen,
      "details_value_mirror_observation_failed"
    );

    return signals;
  }

  const mirrorViolations =
    Array.isArray(
      detailsMirror?.violations
    )
      ? detailsMirror.violations
      : [];

  const mirrorCodes =
    [
      ...new Set(
        mirrorViolations
          .map(
            violation =>
              text(
                violation?.code
              )
          )
          .filter(Boolean)
      )
    ]
      .sort();

  if (
    mirrorCodes.includes(
      "source_detail_extra_file"
    )
  ) {
    addUniqueSignal(
      signals,
      seen,
      "source_detail_extra_file"
    );
  }

  const unclassifiedMirrorCodes =
    mirrorCodes.filter(
      code =>
        code !==
          "source_detail_extra_file"
    );

  if (
    unclassifiedMirrorCodes
      .length > 0
  ) {
    addUniqueSignal(
      signals,
      seen,
      "details_value_mirror_unclassified_violation:" +
        unclassifiedMirrorCodes.join(",")
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
  detailsMirror = null,
  publishedDetailsParity = null,
  canonicalSuppressedAliasObservation = null
} = {}) {
  const signals =
    collectCheckpointAwareTargetedRepairShadowSignals({
      dayKey,
      currentDayKey,
      manifest,
      freshness,
      buildReport,
      detailsMirror,
      publishedDetailsParity,
      canonicalSuppressedAliasObservation
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
