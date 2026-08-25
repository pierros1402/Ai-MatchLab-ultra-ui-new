function clean(value) {
  return String(value ?? "").trim();
}

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(
    clean(value)
  );
}

export function intradayPublicationFixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId
  );
}

function collectFixtureIds(rows = []) {
  const ids = [];
  const missingIndexes = [];
  const seen = new Set();
  const duplicateIds = new Set();

  for (
    const [index, row]
    of (Array.isArray(rows) ? rows : []).entries()
  ) {
    const id =
      intradayPublicationFixtureId(row);

    if (!id) {
      missingIndexes.push(index);
      continue;
    }

    if (seen.has(id)) {
      duplicateIds.add(id);
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return {
    ids,
    idSet: seen,
    missingIndexes,
    duplicateIds:
      [...duplicateIds].sort()
  };
}

function strictPublishedEspnProviderId(row) {
  const values = [
    row?.sourceMatchId,
    row?.sourceId,
    row?.providerIds?.espn
  ]
    .map(clean)
    .filter(Boolean);

  if (values.length === 0) {
    return "";
  }

  const unique =
    [...new Set(values)];

  if (unique.length !== 1) {
    return "";
  }

  const id =
    unique[0];

  return /^\d+$/u.test(id)
    ? id
    : "";
}

/*
 * Authoritative shrink is intentionally narrow.
 *
 * A published row may disappear from current canonical membership only when
 * the current canonical league file records an exact ESPN event-summary
 * reconciliation proving that exact provider ID belongs to another Athens day.
 *
 * This is NOT a generic "canonical shrank, so delete snapshot rows" rule.
 * Unknown acquisition loss still fails closed in resolveIntradayPublishedUniverse.
 */
export function collectAuthoritativeWrongDayPublishedFixtureIds({
  dayKey = "",
  publishedFixtures = [],
  canonicalLeaguePayloads = []
} = {}) {
  const day =
    clean(dayKey);

  if (!isDayKey(day)) {
    return [];
  }

  const wrongDayProviderIdsByLeague =
    new Map();

  for (
    const payload
    of (
      Array.isArray(canonicalLeaguePayloads)
        ? canonicalLeaguePayloads
        : []
    )
  ) {
    if (
      !payload ||
      typeof payload !== "object"
    ) {
      continue;
    }

    const leagueSlug =
      clean(payload?.leagueSlug);

    const meta =
      payload?.sourceMeta;

    const reconciliation =
      meta?.exactEventSummaryReconciliation;

    const policy =
      reconciliation?.policy;

    if (
      !leagueSlug ||
      clean(payload?.dayKey) !== day ||
      clean(meta?.requestedDayKey) !== day ||
      clean(meta?.requestedLeagueSlug) !== leagueSlug ||
      clean(meta?.acquisitionProvider) !==
        "espn_direct_league_status" ||
      !reconciliation ||
      !policy
    ) {
      continue;
    }

    if (
      policy.exactProviderIdOnly !== true ||
      policy.authoritativeEventDayOnly !== true ||
      policy.teamIdentityRequired !== true ||
      policy.homeAwayOrientationRequired !== true ||
      policy.crossDayStatusPromotion !== false ||
      policy.heuristicFinalPromotion !== false
    ) {
      continue;
    }

    const candidates =
      Number(reconciliation.candidates);

    const wrongDayMatches =
      Number(reconciliation.wrongDayMatches);

    const wrongDayRemovedRows =
      Number(reconciliation.wrongDayRemovedRows);

    const identityRejected =
      Number(
        reconciliation.wrongDayIdentityRejectedRows
      );

    if (
      !Number.isInteger(candidates) ||
      !Number.isInteger(wrongDayMatches) ||
      !Number.isInteger(wrongDayRemovedRows) ||
      !Number.isInteger(identityRejected) ||
      wrongDayMatches <= 0 ||
      wrongDayRemovedRows <= 0 ||
      candidates < wrongDayMatches ||
      wrongDayMatches !== wrongDayRemovedRows ||
      identityRejected !== 0
    ) {
      continue;
    }

    const acceptedProviderSlugs =
      new Set(
        [
          leagueSlug,
          meta?.requestedLeagueSlug,
          ...(
            Array.isArray(meta?.providerFetchSlugs)
              ? meta.providerFetchSlugs
              : []
          )
        ]
          .map(clean)
          .filter(Boolean)
      );

    const otherDayFetches =
      (
        Array.isArray(reconciliation?.fetches)
          ? reconciliation.fetches
          : []
      )
        .filter(fetch => {
          const providerMatchId =
            clean(fetch?.providerMatchId);

          const authoritativeDayKey =
            clean(fetch?.authoritativeDayKey);

          const providerSlug =
            clean(fetch?.providerSlug);

          return (
            fetch?.ok === true &&
            clean(fetch?.kind) === "other_day" &&
            clean(fetch?.reason) === "" &&
            /^\d+$/u.test(providerMatchId) &&
            acceptedProviderSlugs.has(
              providerSlug
            ) &&
            isDayKey(authoritativeDayKey) &&
            authoritativeDayKey !== day
          );
        });

    const providerIds =
      new Set(
        otherDayFetches
          .map(fetch =>
            clean(fetch?.providerMatchId)
          )
      );

    /*
     * Every row claimed as removed must have one unique successful exact
     * other-day provider proof. Any count ambiguity returns no authority.
     */
    if (
      otherDayFetches.length !==
        wrongDayRemovedRows ||
      providerIds.size !==
        wrongDayRemovedRows
    ) {
      continue;
    }

    wrongDayProviderIdsByLeague.set(
      leagueSlug,
      providerIds
    );
  }

  const authorizedFixtureIds =
    new Set();

  for (
    const row
    of (
      Array.isArray(publishedFixtures)
        ? publishedFixtures
        : []
    )
  ) {
    if (
      clean(row?.source).toLowerCase() !==
        "espn"
    ) {
      continue;
    }

    if (clean(row?.dayKey) !== day) {
      continue;
    }

    const fixtureId =
      intradayPublicationFixtureId(row);

    const leagueSlug =
      clean(row?.leagueSlug);

    const providerId =
      strictPublishedEspnProviderId(row);

    if (
      !fixtureId ||
      !leagueSlug ||
      !providerId
    ) {
      continue;
    }

    const authoritativeProviderIds =
      wrongDayProviderIdsByLeague.get(
        leagueSlug
      );

    if (
      authoritativeProviderIds?.has(
        providerId
      )
    ) {
      authorizedFixtureIds.add(
        fixtureId
      );
    }
  }

  return [
    ...authorizedFixtureIds
  ].sort();
}

export function resolveIntradayPublishedUniverse({
  publishedFixtures = [],
  currentFixtures = [],
  publishedDetailIds = [],
  authoritativelyRemovedFixtureIds = []
} = {}) {
  const published =
    collectFixtureIds(publishedFixtures);

  const current =
    collectFixtureIds(currentFixtures);

  const detailIds =
    new Set(
      (
        Array.isArray(publishedDetailIds)
          ? publishedDetailIds
          : []
      )
        .map(clean)
        .filter(Boolean)
    );

  const requestedRemovalIds =
    new Set(
      (
        authoritativelyRemovedFixtureIds
          instanceof Set
          ? [...authoritativelyRemovedFixtureIds]
          : (
              Array.isArray(
                authoritativelyRemovedFixtureIds
              )
                ? authoritativelyRemovedFixtureIds
                : []
            )
      )
        .map(clean)
        .filter(Boolean)
    );

  const missingCurrentFixtureIds =
    published.ids
      .filter(id =>
        !current.idSet.has(id)
      )
      .sort();

  /*
   * The caller may only remove ids that are BOTH absent from current canonical
   * membership and independently authorized by strict provider-day evidence.
   * Supplying an id that still exists in current canonical truth cannot hide it.
   */
  const authoritativelyRemovedFixtureIdsApplied =
    missingCurrentFixtureIds
      .filter(id =>
        requestedRemovalIds.has(id)
      )
      .sort();

  const authoritativeRemovalSet =
    new Set(
      authoritativelyRemovedFixtureIdsApplied
    );

  const unauthorizedMissingCurrentFixtureIds =
    missingCurrentFixtureIds
      .filter(id =>
        !authoritativeRemovalSet.has(id)
      )
      .sort();

  const allowedFixtureIds =
    published.ids
      .filter(id =>
        !authoritativeRemovalSet.has(id)
      );

  /*
   * Details for provider-proven wrong-day rows are intentionally prunable.
   * Every still-allowed published fixture remains detail-complete or the lock
   * fails closed exactly as before.
   */
  const missingPublishedDetailIds =
    allowedFixtureIds
      .filter(id =>
        !detailIds.has(id)
      )
      .sort();

  const deferredFixtureIds =
    current.ids
      .filter(id =>
        !published.idSet.has(id)
      )
      .sort();

  let reason =
    null;

  if (
    published.ids.length === 0 &&
    current.ids.length > 0
  ) {
    reason =
      "published_fixture_universe_missing";
  } else if (
    published.missingIndexes.length > 0
  ) {
    reason =
      "published_fixture_id_missing";
  } else if (
    current.missingIndexes.length > 0
  ) {
    reason =
      "current_fixture_id_missing";
  } else if (
    published.duplicateIds.length > 0
  ) {
    reason =
      "published_fixture_id_duplicate";
  } else if (
    current.duplicateIds.length > 0
  ) {
    reason =
      "current_fixture_id_duplicate";
  } else if (
    unauthorizedMissingCurrentFixtureIds.length > 0
  ) {
    reason =
      "published_fixture_missing_from_current_universe";
  } else if (
    missingPublishedDetailIds.length > 0
  ) {
    reason =
      "published_fixture_detail_missing";
  }

  return {
    ok:
      reason === null,

    reason,

    publishedFixtureCount:
      published.ids.length,

    currentFixtureCount:
      current.ids.length,

    allowedFixtureCount:
      allowedFixtureIds.length,

    allowedFixtureIds,

    deferredFixtureIds,

    missingCurrentFixtureIds,

    authoritativelyRemovedFixtureIds:
      authoritativelyRemovedFixtureIdsApplied,

    unauthorizedMissingCurrentFixtureIds,

    missingPublishedDetailIds,

    publishedMissingIdIndexes:
      published.missingIndexes,

    currentMissingIdIndexes:
      current.missingIndexes,

    publishedDuplicateIds:
      published.duplicateIds,

    currentDuplicateIds:
      current.duplicateIds
  };
}
