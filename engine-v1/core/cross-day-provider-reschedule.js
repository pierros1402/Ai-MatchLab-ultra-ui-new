const DEFAULT_PAST_GRACE_MS = 6 * 60 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeTeam(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "");
}

function parseMs(value) {
  const ms = Date.parse(clean(value));
  return Number.isFinite(ms) ? ms : NaN;
}

function scoreAbsent(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function statusText(row) {
  return [
    row?.status,
    row?.rawStatus,
    row?.statusType,
    row?.sourceStatus,
    row?.sourceStatusType
  ]
    .map(value => clean(value).toUpperCase())
    .filter(Boolean)
    .join(" ");
}

function isPlayedTerminal(row) {
  return /\b(FT|FINAL|FULL_TIME|STATUS_FINAL(?:_AET|_PEN)?|STATUS_FULL_TIME(?:_AET|_PEN)?|AET|PEN)\b/u
    .test(statusText(row));
}

function isExplicitNonPlayed(row) {
  return /\b(POSTPONED|CANCELED|CANCELLED|ABANDONED|SUSPENDED|WALKOVER)\b/u
    .test(statusText(row));
}

function isScorelessScheduled(row) {
  if (!scoreAbsent(row?.scoreHome) || !scoreAbsent(row?.scoreAway)) return false;
  if (isPlayedTerminal(row) || isExplicitNonPlayed(row)) return false;

  const status = statusText(row);
  return /\b(SCHEDULED|PRE|STATUS_SCHEDULED|PRE_MATCH)\b/u.test(status);
}

function sourceName(row) {
  return clean(row?.source || row?.provider || row?.adapterId).toLowerCase();
}

function providerId(row) {
  return clean(
    row?.sourceMatchId ||
    row?.sourceId ||
    row?.providerMatchId ||
    row?.providerIds?.[sourceName(row)]
  );
}

function rowIdentity(row) {
  const source = sourceName(row);
  const id = providerId(row);
  return source && id ? `${source}:${id}` : "";
}

function dayKey(row) {
  return clean(row?.dayKey);
}

function compactRow(row) {
  return {
    canonicalId: clean(row?.canonicalId || row?.matchId) || null,
    dayKey: dayKey(row) || null,
    source: sourceName(row) || null,
    providerMatchId: providerId(row) || null,
    leagueSlug: clean(row?.leagueSlug) || null,
    homeTeam: clean(row?.homeTeam) || null,
    awayTeam: clean(row?.awayTeam) || null,
    kickoffUtc: clean(row?.kickoffUtc) || null,
    firstSeenAt: clean(row?.firstSeenAt) || null,
    lastSeenAt: clean(row?.lastSeenAt) || null,
    status: clean(row?.status) || null,
    rawStatus: clean(row?.rawStatus) || null,
    scoreHome: row?.scoreHome ?? null,
    scoreAway: row?.scoreAway ?? null
  };
}

export function classifyCrossDayProviderRescheduleGroup(
  rows = [],
  {
    asOfMs = Date.now(),
    pastGraceMs = DEFAULT_PAST_GRACE_MS
  } = {}
) {
  const input = Array.isArray(rows) ? rows.filter(Boolean) : [];

  if (input.length < 2) {
    return { ok: false, reason: "cross_day_group_requires_multiple_rows" };
  }

  const enriched = input.map(row => ({
    row,
    identity: rowIdentity(row),
    dayKey: dayKey(row),
    leagueSlug: clean(row?.leagueSlug),
    homeKey: normalizeTeam(row?.homeTeam),
    awayKey: normalizeTeam(row?.awayTeam),
    kickoffMs: parseMs(row?.kickoffUtc),
    firstSeenMs: parseMs(row?.firstSeenAt),
    lastSeenMs: parseMs(row?.lastSeenAt)
  }));

  if (enriched.some(item =>
    !item.identity ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(item.dayKey) ||
    !item.leagueSlug ||
    !item.homeKey ||
    !item.awayKey ||
    !Number.isFinite(item.kickoffMs) ||
    !Number.isFinite(item.lastSeenMs)
  )) {
    return { ok: false, reason: "cross_day_group_identity_or_time_incomplete" };
  }

  if (new Set(enriched.map(item => item.identity)).size !== 1) {
    return { ok: false, reason: "cross_day_provider_identity_mismatch" };
  }

  if (new Set(enriched.map(item => item.dayKey)).size < 2) {
    return { ok: false, reason: "cross_day_distinct_day_required" };
  }

  if (new Set(enriched.map(item => item.leagueSlug)).size !== 1) {
    return { ok: false, reason: "cross_day_league_mismatch" };
  }

  if (new Set(enriched.map(item => `${item.homeKey}|${item.awayKey}`)).size !== 1) {
    return { ok: false, reason: "cross_day_ordered_team_pair_mismatch" };
  }

  const byObservation = [...enriched].sort((a, b) => {
    if (a.lastSeenMs !== b.lastSeenMs) return b.lastSeenMs - a.lastSeenMs;
    if (a.kickoffMs !== b.kickoffMs) return b.kickoffMs - a.kickoffMs;
    return b.dayKey.localeCompare(a.dayKey);
  });

  const evidence = byObservation[0];
  const second = byObservation[1];

  if (evidence.lastSeenMs === second.lastSeenMs) {
    return { ok: false, reason: "cross_day_latest_observation_ambiguous" };
  }

  const safeAsOfMs = Number(asOfMs);
  const safeGraceMs = Number(pastGraceMs);
  if (!Number.isFinite(safeAsOfMs) || !Number.isFinite(safeGraceMs) || safeGraceMs < 0) {
    return { ok: false, reason: "cross_day_classifier_time_options_invalid" };
  }

  const superseded = byObservation
    .slice(1)
    .filter(item =>
      item.kickoffMs < evidence.kickoffMs &&
      item.lastSeenMs < evidence.lastSeenMs &&
      safeAsOfMs >= item.kickoffMs + safeGraceMs &&
      isScorelessScheduled(item.row)
    )
    .map(item => ({
      ...compactRow(item.row),
      supersededByCanonicalId:
        clean(evidence.row?.canonicalId || evidence.row?.matchId) || null,
      supersededByDayKey: evidence.dayKey,
      supersededByKickoffUtc: clean(evidence.row?.kickoffUtc) || null,
      supersededByLastSeenAt: clean(evidence.row?.lastSeenAt) || null,
      decisionBasis: "exact_provider_identity_cross_day_supersession"
    }));

  if (!superseded.length) {
    return {
      ok: false,
      reason: "cross_day_no_safe_historical_supersession",
      evidence: compactRow(evidence.row)
    };
  }

  return {
    ok: true,
    reason: null,
    providerIdentity: evidence.identity,
    leagueSlug: evidence.leagueSlug,
    orderedTeamPair: {
      homeTeam: clean(evidence.row?.homeTeam),
      awayTeam: clean(evidence.row?.awayTeam)
    },
    evidence: compactRow(evidence.row),
    superseded,
    guarantees: {
      exactProviderIdentity: true,
      sameLeague: true,
      exactNormalizedOrderedTeamPair: true,
      uniqueLatestObservation: true,
      strictlyNewerKickoff: true,
      strictlyNewerObservation: true,
      oldKickoffPastGraceRequired: true,
      oldOccurrenceScorelessScheduledOnly: true,
      playedFinalNeverSuperseded: true,
      existingExplicitNonPlayedNeverSuperseded: true
    }
  };
}

export const CROSS_DAY_PROVIDER_RESCHEDULE_DEFAULT_PAST_GRACE_MS =
  DEFAULT_PAST_GRACE_MS;
