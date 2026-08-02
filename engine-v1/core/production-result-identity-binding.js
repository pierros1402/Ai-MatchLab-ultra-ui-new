import {
  getProductionIdentityResolver,
} from "./production-identity-resolver-runtime.js";

const RESULT_TRUTH_FIELDS = Object.freeze([
  "status",
  "statusType",
  "rawStatus",
  "statusName",
  "operationalState",
  "scoreHome",
  "scoreAway",
  "homeScore",
  "awayScore",
  "scoreKey",
  "verifiedFinalTruth",
  "finalTruthVerdict",
  "verdict",
  "finalScore",
  "settlement",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (value === undefined) return "__undefined__";
  return JSON.stringify(value);
}

export function captureResultTruth(row) {
  return Object.freeze(
    Object.fromEntries(
      RESULT_TRUTH_FIELDS.map(field => [
        field,
        stableValue(row?.[field]),
      ]),
    ),
  );
}

export function assertResultTruthUnchanged(
  before,
  after,
) {
  const beforeTruth =
    captureResultTruth(before);
  const afterTruth =
    captureResultTruth(after);

  for (const field of RESULT_TRUTH_FIELDS) {
    if (
      beforeTruth[field] !==
      afterTruth[field]
    ) {
      throw new Error(
        `production_result_identity_truth_changed:${field}`,
      );
    }
  }

  return true;
}

export function resultFixtureSignals(row) {
  const out = [];

  for (const field of [
    "canonicalId",
    "matchId",
    "fixtureId",
    "id",
    "sourceFixtureId",
  ]) {
    const value =
      clean(row?.[field]);

    if (
      value &&
      !out.some(item => item.value === value)
    ) {
      out.push({
        field,
        value,
      });
    }
  }

  return out;
}

function validateExistingIdentityField(
  row,
  field,
  expected,
  fixtureId,
) {
  const existing =
    clean(row?.[field]);

  if (
    existing &&
    existing !== expected
  ) {
    throw new Error(
      `production_result_identity_conflict:${field}:${fixtureId}`,
    );
  }
}

function managedResolutionFromSignals(
  row,
  resolver,
) {
  const managed = [];

  for (const signal of resultFixtureSignals(row)) {
    const resolution =
      resolver.resolveFixtureId(
        signal.value,
      );

    if (resolution?.ok) {
      managed.push({
        ...signal,
        resolution,
      });
      continue;
    }

    if (
      resolution?.status !==
      "UNKNOWN_FIXTURE_ID"
    ) {
      throw new Error(
        `production_result_identity_resolution_failed:${signal.value}:${resolution?.status || "unknown"}`,
      );
    }
  }

  if (managed.length === 0) {
    return null;
  }

  const resolvedTargets =
    new Set(
      managed.map(
        item =>
          item.resolution
            .resolvedFixtureId,
      ),
    );

  if (resolvedTargets.size !== 1) {
    throw new Error(
      "production_result_identity_conflicting_fixture_signals",
    );
  }

  const preferred =
    managed.find(
      item =>
        item.field ===
        "sourceFixtureId",
    ) ||
    managed.find(
      item =>
        item.resolution.sourceRole ===
        "retained",
    ) ||
    managed[0];

  return {
    preferred,
    managedSignals: managed,
    resolvedFixtureId:
      preferred.resolution
        .resolvedFixtureId,
  };
}

export function bindProductionResultIdentity(
  row,
  {
    resolver =
      getProductionIdentityResolver(),
    canonicalFixtureIds = null,
    requireCanonicalMembership = false,
  } = {},
) {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    throw new Error(
      "production_result_identity_row_required",
    );
  }

  if (
    !resolver ||
    typeof resolver.resolveFixtureId !==
      "function"
  ) {
    throw new Error(
      "production_result_identity_resolver_required",
    );
  }

  const beforeTruth =
    captureResultTruth(row);

  const managed =
    managedResolutionFromSignals(
      row,
      resolver,
    );

  if (!managed) {
    return Object.freeze({
      ok: true,
      status:
        "UNMANAGED_RESULT_IDENTITY_PASSTHROUGH",
      managed: false,
      row,
      sourceFixtureIds:
        resultFixtureSignals(row)
          .map(item => item.value),
      scoreTruthChanged: false,
      statusTruthChanged: false,
      resultMemoryRewriteAuthorized: false,
      productionMutationAuthorized: false,
    });
  }

  const resolution =
    managed.preferred.resolution;

  if (requireCanonicalMembership) {
    const membership =
      resolver.resolveFixtureMembership({
        repositoryFixtureId:
          managed.preferred.value,
        canonicalFixtureIds,
      });

    if (!membership?.ok) {
      throw new Error(
        `production_result_identity_membership_failed:${managed.preferred.value}:${membership?.status || "unknown"}`,
      );
    }
  }

  validateExistingIdentityField(
    row,
    "homeGlobalClubId",
    resolution.homeGlobalClubId,
    managed.preferred.value,
  );

  validateExistingIdentityField(
    row,
    "awayGlobalClubId",
    resolution.awayGlobalClubId,
    managed.preferred.value,
  );

  const existingSourceFixtureId =
    clean(row?.sourceFixtureId);

  if (
    existingSourceFixtureId &&
    !managed.managedSignals.some(
      item =>
        item.value ===
        existingSourceFixtureId,
    )
  ) {
    throw new Error(
      `production_result_identity_conflict:sourceFixtureId:${managed.preferred.value}`,
    );
  }

  const sourceFixtureIds =
    managed.managedSignals
      .map(item => item.value)
      .sort();

  const boundRow = {
    ...row,

    canonicalId:
      resolution.resolvedFixtureId,

    matchId:
      resolution.resolvedFixtureId,

    sourceFixtureId:
      managed.preferred.value,

    sourceFixtureIds,

    sourceFixtureRole:
      resolution.sourceRole,

    fixtureRetentionDecisionId:
      resolution
        .fixtureRetentionDecisionId,

    homeGlobalClubId:
      resolution.homeGlobalClubId,

    awayGlobalClubId:
      resolution.awayGlobalClubId,

    productionIdentityBinding:
      Object.freeze({
        schema:
          "ai-matchlab.production-result-identity-binding.v1",

        sourceFixtureId:
          managed.preferred.value,

        sourceFixtureIds,

        resolvedFixtureId:
          resolution.resolvedFixtureId,

        sourceFixtureRole:
          resolution.sourceRole,

        fixtureRetentionDecisionId:
          resolution
            .fixtureRetentionDecisionId,

        homeGlobalClubId:
          resolution.homeGlobalClubId,

        awayGlobalClubId:
          resolution.awayGlobalClubId,

        scoreTruthChanged: false,
        statusTruthChanged: false,
        fixtureMembershipCreated: false,
        fixtureDeletionAuthorized: false,
        resultMemoryRewriteAuthorized: false,
        historyRewriteAuthorized: false,
        productionMutationAuthorized: false,
      }),
  };

  assertResultTruthUnchanged(
    row,
    boundRow,
  );

  const afterTruth =
    captureResultTruth(boundRow);

  for (const field of RESULT_TRUTH_FIELDS) {
    if (
      beforeTruth[field] !==
      afterTruth[field]
    ) {
      throw new Error(
        `production_result_identity_truth_changed:${field}`,
      );
    }
  }

  return Object.freeze({
    ok: true,
    status:
      resolution.sourceRole ===
        "retained"
        ? "RETAINED_RESULT_IDENTITY_BOUND"
        : "SUPPRESSED_RESULT_LINEAGE_BOUND_TO_RETAINED",

    managed: true,

    sourceFixtureId:
      managed.preferred.value,

    sourceFixtureIds,

    resolvedFixtureId:
      resolution.resolvedFixtureId,

    sourceFixtureRole:
      resolution.sourceRole,

    homeGlobalClubId:
      resolution.homeGlobalClubId,

    awayGlobalClubId:
      resolution.awayGlobalClubId,

    row:
      Object.freeze(boundRow),

    scoreTruthChanged: false,
    statusTruthChanged: false,
    fixtureMembershipCreated: false,
    fixtureDeletionAuthorized: false,
    resultMemoryRewriteAuthorized: false,
    historyRewriteAuthorized: false,
    productionMutationAuthorized: false,
  });
}

export function bindVerifiedFinalResultIdentity(
  payload,
  options = {},
) {
  const bound =
    bindProductionResultIdentity(
      payload,
      options,
    );

  if (!bound.managed) {
    return payload;
  }

  return bound.row;
}

export function resultMemoryIdentityFields(
  row,
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return {};
  }

  const fields = {};

  for (const key of [
    "canonicalId",
    "sourceFixtureId",
    "sourceFixtureIds",
    "sourceFixtureRole",
    "fixtureRetentionDecisionId",
    "homeGlobalClubId",
    "awayGlobalClubId",
    "productionIdentityBinding",
  ]) {
    if (row[key] !== undefined) {
      fields[key] = row[key];
    }
  }

  return fields;
}
