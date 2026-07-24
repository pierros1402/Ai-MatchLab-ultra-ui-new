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

export function buildLiveStatusCompleteness(
  rows = [],
  options = {}
) {
  const staleOpenFixtures = (
    Array.isArray(rows)
      ? rows
      : []
  )
    .map(row =>
      classifyStaleOpenFixture(
        row,
        options
      )
    )
    .filter(Boolean)
    .sort((a, b) =>
      String(a.canonicalId)
        .localeCompare(
          String(b.canonicalId)
        )
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
      heuristicFinalPromotion: false
    },
    staleOpenCount:
      staleOpenFixtures.length,
    staleOpenCanonicalIds:
      staleOpenFixtures.map(
        row => row.canonicalId
      ),
    staleOpenFixtures
  };
}

export {
  DEFAULT_STALE_AFTER_HOURS
};
