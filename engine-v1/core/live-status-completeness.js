const DEFAULT_STALE_AFTER_HOURS = 4;

function clean(value) {
  return String(value ?? "").trim();
}

function statusTokens(row) {
  return [
    row?.status,
    row?.rawStatus,
    row?.statusType,
    row?.operationalState
  ]
    .map(value => clean(value).toUpperCase())
    .filter(Boolean);
}

function isTerminalToken(token) {
  if (!token) return false;

  if (
    token === "FT" ||
    token === "AET" ||
    token === "PEN"
  ) {
    return true;
  }

  return (
    token.includes("FINAL") ||
    token.includes("FULL_TIME") ||
    token.includes("FULL TIME") ||
    token.includes("POSTPONED") ||
    token.includes("CANCELLED") ||
    token.includes("CANCELED") ||
    token.includes("ABANDONED") ||
    token.includes("NOT_PLAYED") ||
    token.includes("NOT PLAYED") ||
    token.includes("WALKOVER") ||
    token.includes("VOID") ||
    token.includes("AWARDED")
  );
}

function isOpenToken(token) {
  if (!token) return false;

  return (
    token === "PRE" ||
    token.includes("SCHEDULED") ||
    token.includes("LIVE") ||
    token.includes("IN_PROGRESS") ||
    token.includes("IN PROGRESS") ||
    token.includes("FIRST_HALF") ||
    token.includes("FIRST HALF") ||
    token.includes("HALF_TIME") ||
    token.includes("HALF TIME") ||
    token.includes("SECOND_HALF") ||
    token.includes("SECOND HALF") ||
    token.includes("EXTRA_TIME") ||
    token.includes("EXTRA TIME") ||
    token.includes("PENALT") ||
    token.includes("PAUSED") ||
    token.includes("DELAYED") ||
    token.includes("INTERRUPTED")
  );
}

function providerIdOf(row) {
  return clean(
    row?.providerMatchId ||
    row?.sourceId ||
    row?.sourceMatchId ||
    row?.matchId
  );
}

function canonicalIdOf(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id
  );
}

function nowMsOf(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Date.parse(clean(value));

  return Number.isFinite(parsed)
    ? parsed
    : Date.now();
}

export function classifyStaleOpenFixture(
  row,
  options = {}
) {
  const source = clean(row?.source).toLowerCase();

  if (!source.startsWith("espn")) {
    return null;
  }

  const providerId = providerIdOf(row);

  if (!providerId) {
    return null;
  }

  const tokens = statusTokens(row);

  if (
    tokens.some(isTerminalToken) ||
    !tokens.some(isOpenToken)
  ) {
    return null;
  }

  const kickoffMs = Date.parse(
    clean(row?.kickoffUtc)
  );

  if (!Number.isFinite(kickoffMs)) {
    return null;
  }

  const staleAfterHours =
    Number.isFinite(
      Number(options.staleAfterHours)
    ) &&
    Number(options.staleAfterHours) > 0
      ? Number(options.staleAfterHours)
      : DEFAULT_STALE_AFTER_HOURS;

  const nowMs = nowMsOf(options.now);
  const ageHours =
    (nowMs - kickoffMs) /
    (60 * 60 * 1000);

  if (ageHours < staleAfterHours) {
    return null;
  }

  return {
    canonicalId: canonicalIdOf(row),
    providerId,
    source,
    leagueSlug:
      clean(row?.leagueSlug) || null,
    providerLeagueSlug:
      clean(row?.providerLeagueSlug) || null,
    kickoffUtc:
      clean(row?.kickoffUtc) || null,
    ageHours:
      Math.round(ageHours * 1000) / 1000,
    status:
      clean(row?.status) || null,
    rawStatus:
      clean(row?.rawStatus) || null,
    statusType:
      clean(row?.statusType) || null,
    operationalState:
      clean(row?.operationalState) || null,
    classification:
      "stale_open_exact_provider_id"
  };
}

function kickoffMsOf(row) {
  const parsed = Date.parse(
    clean(row?.kickoffUtc)
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function latestExactProviderOccurrences(
  rows = []
) {
  const latestByProviderId =
    new Map();

  for (
    const row of
    Array.isArray(rows)
      ? rows
      : []
  ) {
    const source =
      clean(row?.source)
        .toLowerCase();

    if (!source.startsWith("espn")) {
      continue;
    }

    const providerId =
      providerIdOf(row);

    const kickoffMs =
      kickoffMsOf(row);

    if (
      !providerId ||
      kickoffMs === null
    ) {
      continue;
    }

    const existing =
      latestByProviderId.get(
        providerId
      );

    if (
      !existing ||
      kickoffMs > existing.kickoffMs
    ) {
      latestByProviderId.set(
        providerId,
        {
          row,
          kickoffMs
        }
      );
    }
  }

  return latestByProviderId;
}

export function buildLiveStatusCompleteness(
  rows = [],
  options = {}
) {
  const fixtureRows =
    Array.isArray(rows)
      ? rows
      : [];

  const lineageRows =
    Array.isArray(options.lineageRows)
      ? options.lineageRows
      : fixtureRows;

  const latestByProviderId =
    latestExactProviderOccurrences(
      lineageRows
    );

  const staleOpenFixtures = [];
  const supersededOpenFixtures = [];

  for (const row of fixtureRows) {
    const classified =
      classifyStaleOpenFixture(
        row,
        options
      );

    if (!classified) {
      continue;
    }

    const rowKickoffMs =
      kickoffMsOf(row);

    const latest =
      latestByProviderId.get(
        classified.providerId
      );

    if (
      rowKickoffMs !== null &&
      latest &&
      latest.kickoffMs > rowKickoffMs
    ) {
      supersededOpenFixtures.push({
        ...classified,
        classification:
          "superseded_open_exact_provider_id",
        supersededByCanonicalId:
          canonicalIdOf(latest.row) ||
          null,
        supersededByKickoffUtc:
          clean(
            latest.row?.kickoffUtc
          ) ||
          null
      });

      continue;
    }

    staleOpenFixtures.push(
      classified
    );
  }

  const sortByCanonicalId =
    (a, b) =>
      String(a.canonicalId)
        .localeCompare(
          String(b.canonicalId)
        );

  staleOpenFixtures.sort(
    sortByCanonicalId
  );

  supersededOpenFixtures.sort(
    sortByCanonicalId
  );

  const staleAfterHours =
    Number.isFinite(
      Number(options.staleAfterHours)
    ) &&
    Number(options.staleAfterHours) > 0
      ? Number(options.staleAfterHours)
      : DEFAULT_STALE_AFTER_HOURS;

  return {
    schema:
      "ai-matchlab.live-status-completeness.v1",
    ok:
      staleOpenFixtures.length === 0,
    policy: {
      staleAfterHours,
      exactProviderIdOnly: true,
      exactProviderLineageSupersession:
        true,
      heuristicFinalPromotion: false
    },
    staleOpenCount:
      staleOpenFixtures.length,
    staleOpenCanonicalIds:
      staleOpenFixtures.map(
        row => row.canonicalId
      ),
    staleOpenFixtures,
    supersededOpenCount:
      supersededOpenFixtures.length,
    supersededOpenCanonicalIds:
      supersededOpenFixtures.map(
        row => row.canonicalId
      ),
    supersededOpenFixtures
  };
}

export {
  DEFAULT_STALE_AFTER_HOURS
};
