import {
  valueFixtureUniverseContract
} from "./value-fixture-universe.js";

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function validUniverse(
  universe
) {
  const contract =
    valueFixtureUniverseContract(
      universe
    );

  return Boolean(
    Number.isInteger(
      contract.count
    ) &&
    contract.count >= 0 &&
    clean(contract.hash) &&
    Array.isArray(
      contract.canonicalIds
    ) &&
    contract.canonicalIds.length ===
      contract.count &&
    new Set(
      contract.canonicalIds
    ).size ===
      contract.canonicalIds.length &&
    contract.canonicalIds.every(
      id => clean(id)
    )
  );
}

function normalizeIds(
  values,
  {
    stripJsonSuffix = false
  } = {}
) {
  if (
    values === null ||
    values === undefined
  ) {
    return {
      ok: true,
      ids: []
    };
  }

  if (!Array.isArray(values)) {
    return {
      ok: false,
      ids: []
    };
  }

  const ids =
    values.map(value => {
      const raw =
        clean(value);

      return stripJsonSuffix
        ? raw.replace(
            /\.json$/iu,
            ""
          )
        : raw;
    });

  if (
    ids.some(id => !id) ||
    new Set(ids).size !==
      ids.length
  ) {
    return {
      ok: false,
      ids: []
    };
  }

  return {
    ok: true,
    ids:
      [...ids].sort()
  };
}

function sameIds(
  left,
  right
) {
  return (
    JSON.stringify(
      [...left].sort()
    ) ===
    JSON.stringify(
      [...right].sort()
    )
  );
}

function pickId(
  pick
) {
  return clean(
    pick?.canonicalId ||
    pick?.matchId ||
    pick?.fixtureId ||
    pick?.id
  );
}

export function evaluateFrozenValuePublicationMembership({
  dayKey,
  currentUniverse,
  frozenUniverse,
  manifest,
  snapshotFixtures = [],
  publishedPlan = null,
  plans = []
} = {}) {
  const fail =
    reason => ({
      ok: false,
      reason
    });

  const day =
    clean(dayKey);

  if (
    !/^\d{4}-\d{2}-\d{2}$/u
      .test(day)
  ) {
    return fail(
      "invalid_day"
    );
  }

  if (
    !validUniverse(
      currentUniverse
    ) ||
    !validUniverse(
      frozenUniverse
    )
  ) {
    return fail(
      "invalid_fixture_universe"
    );
  }

  const current =
    valueFixtureUniverseContract(
      currentUniverse
    );

  const frozen =
    valueFixtureUniverseContract(
      frozenUniverse
    );

  const rows =
    Array.isArray(
      snapshotFixtures
    )
      ? snapshotFixtures
      : [];

  const snapshotIds =
    rows.map(row =>
      clean(
        row?.canonicalId ||
        row?.matchId
      )
    );

  if (
    snapshotIds.some(id => !id) ||
    new Set(snapshotIds).size !==
      snapshotIds.length
  ) {
    return fail(
      "snapshot_identity_invalid"
    );
  }

  const currentSet =
    new Set(
      current.canonicalIds
    );

  const frozenSet =
    new Set(
      frozen.canonicalIds
    );

  const snapshotSet =
    new Set(
      snapshotIds
    );

  const snapshotAliasToCanonical =
    new Map();

  const snapshotAliasesByCanonical =
    new Map();

  for (
    let index = 0;
    index < rows.length;
    index += 1
  ) {
    const row = rows[index];
    const canonicalId =
      snapshotIds[index];

    if (
      row?.canonicalAliases !==
        undefined &&
      !Array.isArray(
        row?.canonicalAliases
      )
    ) {
      return fail(
        "snapshot_aliases_invalid"
      );
    }

    const aliases =
      (
        Array.isArray(
          row?.canonicalAliases
        )
          ? row.canonicalAliases
          : []
      )
        .map(clean);

    if (
      aliases.some(alias =>
        !alias
      ) ||
      new Set(aliases).size !==
        aliases.length
    ) {
      return fail(
        "snapshot_aliases_invalid"
      );
    }

    snapshotAliasesByCanonical.set(
      canonicalId,
      aliases
    );

    for (const alias of aliases) {
      if (
        snapshotSet.has(alias) &&
        alias !== canonicalId
      ) {
        return fail(
          "snapshot_alias_conflicts_current_identity"
        );
      }

      const existing =
        snapshotAliasToCanonical
          .get(alias);

      if (
        existing &&
        existing !== canonicalId
      ) {
        return fail(
          "snapshot_alias_ambiguous"
        );
      }

      snapshotAliasToCanonical.set(
        alias,
        canonicalId
      );
    }
  }

  const snapshotContainsIdentity =
    id =>
      snapshotSet.has(id) ||
      snapshotAliasToCanonical
        .has(id);

  const publication =
    manifest
      ?.publicationUniverse ||
    {};

  const publicationMode =
    clean(
      publication?.mode
    );

  const fullCurrentPublication =
    publicationMode ===
      "full_current_universe";

  const publishedMissingCurrent =
    snapshotIds.filter(
      id =>
        !currentSet.has(id)
    );

  if (
    publishedMissingCurrent.length >
    0
  ) {
    return fail(
      "published_fixture_missing_current"
    );
  }

  const publishedOutsideFrozen =
    snapshotIds.filter(id => {
      if (frozenSet.has(id)) {
        return false;
      }

      const aliases =
        snapshotAliasesByCanonical
          .get(id) ||
        [];

      return !aliases.some(alias =>
        frozenSet.has(alias)
      );
    });

  if (
    !fullCurrentPublication &&
    publishedOutsideFrozen.length >
    0
  ) {
    return fail(
      "published_fixture_outside_frozen_cohort"
    );
  }

  const removedFixtureIds =
    frozen.canonicalIds
      .filter(
        id =>
          !snapshotContainsIdentity(id)
      )
      .sort();

  const resolvedFrozenAliasMappings =
    frozen.canonicalIds
      .filter(id =>
        !snapshotSet.has(id) &&
        snapshotAliasToCanonical
          .has(id)
      )
      .map(id => ({
        frozenCanonicalId: id,
        publishedCanonicalId:
          snapshotAliasToCanonical
            .get(id)
      }))
      .sort((left, right) =>
        left.frozenCanonicalId
          .localeCompare(
            right.frozenCanonicalId
          )
      );

  const deferredCurrentFixtureIds =
    current.canonicalIds
      .filter(
        id =>
          !snapshotSet.has(id)
      )
      .sort();

  if (
    fullCurrentPublication &&
    !sameIds(
      snapshotIds,
      current.canonicalIds
    )
  ) {
    return fail(
      "full_current_publication_membership_mismatch"
    );
  }

  const counts =
    manifest?.counts ||
    {};

  const valueGate =
    manifest?.valueGate ||
    {};

  const declaredDeferred =
    normalizeIds(
      publication
        ?.deferredFixtureIds
    );

  if (!declaredDeferred.ok) {
    return fail(
      "declared_deferred_ids_invalid"
    );
  }

  if (
    !sameIds(
      declaredDeferred.ids,
      deferredCurrentFixtureIds
    )
  ) {
    return fail(
      "deferred_current_membership_mismatch"
    );
  }

  const manifestSafe =
    manifest?.ok === true &&
    clean(
      manifest?.date
    ) === day &&
    clean(
      manifest?.source
    ) ===
      "local_canonical_export" &&
    (
      publicationMode ===
        "intraday_status_only" ||
      fullCurrentPublication
    ) &&
    Number(
      publication
        ?.currentFixtureCount
    ) ===
      current.count &&
    Number(
      publication
        ?.publishedFixtureCount
    ) ===
      snapshotIds.length &&
    Number(
      publication
        ?.deferredFixtureCount
    ) ===
      deferredCurrentFixtureIds.length &&
    Number(
      manifest
        ?.canonicalFixtureCount
    ) ===
      current.count &&
    Number(
      manifest?.fixtureJsonCount
    ) ===
      current.count &&
    Number(
      counts?.fixtures
    ) ===
      snapshotIds.length &&
    Number(
      counts?.details
    ) ===
      snapshotIds.length &&
    Number(
      counts
        ?.detailsMatchedToFixtures
    ) ===
      snapshotIds.length &&
    Number(
      counts
        ?.detailsMissingForFixtures
    ) ===
      0 &&
    Array.isArray(
      manifest
        ?.detailsMissingForFixtures
    ) &&
    manifest
      .detailsMissingForFixtures
      .length ===
      0 &&
    Number(
      valueGate?.fixtures
    ) ===
      snapshotIds.length &&
    valueGate?.ok === true &&
    valueGate
      ?.frozenIdentityBound ===
      true &&
    valueGate
      ?.frozenReleaseSafe ===
      true &&
    Number(
      valueGate
        ?.orphanPickCount
    ) ===
      0 &&
    Number(
      valueGate
        ?.missingMatchIdPickCount
    ) ===
      0 &&
    valueGate?.dayBound ===
      true &&
    valueGate
      ?.canonicalSourceBound ===
      true;

  if (!manifestSafe) {
    return fail(
      "publication_manifest_not_safe"
    );
  }

  const publishedPlans =
    [
      ...(
        Array.isArray(plans)
          ? plans
          : []
      )
    ];

  if (fullCurrentPublication) {
    const publishedPicks =
      Array.isArray(
        publishedPlan?.picks
      )
        ? publishedPlan.picks
        : null;

    const publishedPlanSafe =
      publishedPlan &&
      typeof publishedPlan ===
        "object" &&
      clean(
        publishedPlan?.date
      ) === day &&
      clean(
        publishedPlan?.planId
      ) === "plan-a" &&
      clean(
        publishedPlan?.outputMode
      ) ===
        "plan-a-observation" &&
      publishedPlan?.immutable ===
        true &&
      clean(
        publishedPlan
          ?.publicationAuthority
      ) ===
        "frozen_plan_a_observation" &&
      Array.isArray(
        publishedPicks
      ) &&
      Number.isInteger(
        publishedPlan?.count
      ) &&
      publishedPlan.count ===
        publishedPicks.length;

    if (!publishedPlanSafe) {
      return fail(
        "full_current_publication_plan_invalid"
      );
    }

    publishedPlans.push(
      publishedPlan
    );
  }

  for (const plan of publishedPlans) {
    const picks =
      Array.isArray(plan?.picks)
        ? plan.picks
        : [];

    for (const pick of picks) {
      const id =
        pickId(pick);

      if (
        !id ||
        !snapshotContainsIdentity(id)
      ) {
        return fail(
          "frozen_pick_not_publishable"
        );
      }
    }
  }

  if (fullCurrentPublication) {
    return {
      ok: true,

      reason:
        "frozen_value_full_current_publication_membership_preserved",

      publicationMembershipPreserved:
        true,

      authorizedShrink:
        false,

      removedFixtureIds,

      deferredCurrentFixtureIds,

      publishedOutsideFrozenFixtureIds:
        publishedOutsideFrozen
          .sort(),

      resolvedFrozenAliasMappings,

      evidenceSource:
        "full_current_universe_exact_membership",

      frozenFixtureCount:
        frozen.count,

      currentFixtureCount:
        current.count,

      publishedFixtureCount:
        snapshotIds.length
    };
  }

  const explicit =
    normalizeIds(
      publication
        ?.authoritativelyRemovedFixtureIds
    );

  const legacy =
    normalizeIds(
      publication
        ?.legacyPrunedFixtureIds
    );

  if (
    !explicit.ok ||
    !legacy.ok
  ) {
    return fail(
      "prune_evidence_invalid"
    );
  }

  let evidenceIds =
    [
      ...new Set([
        ...explicit.ids,
        ...legacy.ids
      ])
    ].sort();

  let evidenceSource =
    explicit.ids.length > 0 &&
    legacy.ids.length > 0
      ? "persisted_mixed_prune_ledger"
      : explicit.ids.length > 0
        ? "persisted_authoritative_prune_ledger"
        : legacy.ids.length > 0
          ? "persisted_legacy_prune_ledger"
          : "none";

  if (
    evidenceIds.length === 0 &&
    removedFixtureIds.length > 0
  ) {
    const bootstrap =
      normalizeIds(
        manifest
          ?.orphanDetailsRemoved,
        {
          stripJsonSuffix:
            true
        }
      );

    if (
      !bootstrap.ok ||
      Number(
        counts
          ?.orphanDetailsRemoved
      ) !==
        bootstrap.ids.length
    ) {
      return fail(
        "legacy_prune_bootstrap_invalid"
      );
    }

    evidenceIds =
      bootstrap.ids;

    evidenceSource =
      "legacy_orphan_details_bootstrap";
  }

  if (
    !sameIds(
      evidenceIds,
      removedFixtureIds
    )
  ) {
    return fail(
      "frozen_publication_removal_evidence_mismatch"
    );
  }

  return {
    ok: true,

    reason:
      "frozen_value_publication_membership_preserved",

    publicationMembershipPreserved:
      true,

    authorizedShrink:
      removedFixtureIds.length >
      0,

    removedFixtureIds,

    deferredCurrentFixtureIds,

    resolvedFrozenAliasMappings,

    evidenceSource,

    frozenFixtureCount:
      frozen.count,

    currentFixtureCount:
      current.count,

    publishedFixtureCount:
      snapshotIds.length
  };
}
