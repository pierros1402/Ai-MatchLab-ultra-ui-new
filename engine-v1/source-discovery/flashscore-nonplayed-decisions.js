const DECISIONS = Object.freeze([
  Object.freeze({
    decisionId:
      "flashscore-nonplayed-20260719-ldvtm1Wg-v1",

    policyVersion:
      "flashscore-nonplayed-decision-v1",

    dayKey:
      "2026-07-19",

    canonicalId:
      "cid_kaz1_ertispavlodar_astana_20260719",

    leagueSlug:
      "kaz.1",

    provider:
      "flashscore",

    providerMatchId:
      "ldvtm1Wg",

    resolvedStatus:
      "STATUS_POSTPONED",

    decisionBasis:
      "operator_confirmed_postponed_match",

    requiredProviderEvidence:
      Object.freeze({
        statusCode: "3",
        statusDetailCode: "4",
        scores: "absent"
      })
  }),

  Object.freeze({
    decisionId:
      "flashscore-nonplayed-20260725-r1CG9jwR-v1",

    policyVersion:
      "flashscore-nonplayed-decision-v1",

    dayKey:
      "2026-07-25",

    canonicalId:
      "cid_svn1_aluminij_celje_20260725",

    leagueSlug:
      "svn.1",

    provider:
      "flashscore",

    providerMatchId:
      "r1CG9jwR",

    resolvedStatus:
      "STATUS_POSTPONED",

    decisionBasis:
      "operator_confirmed_postponed_match",

    requiredProviderEvidence:
      Object.freeze({
        statusCode: "3",
        statusDetailCode: "4",
        scores: "absent"
      })
  }),

  Object.freeze({
    decisionId:
      "flashscore-nonplayed-20260725-88Qs0xvB-v1",

    policyVersion:
      "flashscore-nonplayed-decision-v1",

    dayKey:
      "2026-07-25",

    canonicalId:
      "cid_usa2_birmingham_newmexico_20260725",

    leagueSlug:
      "usa.2",

    provider:
      "flashscore",

    providerMatchId:
      "88Qs0xvB",

    resolvedStatus:
      "STATUS_POSTPONED",

    decisionBasis:
      "exact_provider_occurrence_rescheduled",

    evidenceDayKey:
      "2026-07-26",

    evidenceKickoffUtc:
      "2026-07-25T23:00:00.000Z",

    requiredProviderEvidence:
      Object.freeze({
        statusCode: "3",
        statusDetailCode: "4",
        scores: "absent"
      })
  }),

  Object.freeze({
    decisionId:
      "flashscore-nonplayed-20260726-88Qs0xvB-v1",

    policyVersion:
      "flashscore-nonplayed-decision-v1",

    dayKey:
      "2026-07-26",

    canonicalId:
      "cid_usa2_birmingham_newmexico_20260726",

    leagueSlug:
      "usa.2",

    provider:
      "flashscore",

    providerMatchId:
      "88Qs0xvB",

    resolvedStatus:
      "STATUS_POSTPONED",

    decisionBasis:
      "operator_confirmed_postponed_match",

    requiredProviderEvidence:
      Object.freeze({
        statusCode: "3",
        statusDetailCode: "4",
        scores: "absent"
      })
  })
]);

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function listApprovedFlashscoreNonPlayedDecisions() {
  return DECISIONS.map(
    decision => ({
      ...decision,

      evidenceDayKey:
        decision.evidenceDayKey ||
        null,

      evidenceKickoffUtc:
        decision.evidenceKickoffUtc ||
        null,

      requiredProviderEvidence: {
        ...decision
          .requiredProviderEvidence
      }
    })
  );
}

export function resolveApprovedFlashscoreNonPlayedDecision({
  dayKey,
  canonicalId,
  matchId,
  providerMatchId
} = {}) {
  const requestedDay =
    clean(dayKey);

  const requestedCanonicalId =
    clean(
      canonicalId ||
      matchId
    );

  const requestedProviderId =
    clean(providerMatchId);

  if (
    !requestedDay ||
    !requestedCanonicalId
  ) {
    return null;
  }

  const matches =
    DECISIONS.filter(
      decision =>
        decision.dayKey ===
          requestedDay &&
        decision.canonicalId ===
          requestedCanonicalId &&
        (
          !requestedProviderId ||
          decision.providerMatchId ===
            requestedProviderId
        )
    );

  if (matches.length !== 1) {
    return null;
  }

  return {
    ...matches[0],

    evidenceDayKey:
      matches[0].evidenceDayKey ||
      null,

    evidenceKickoffUtc:
      matches[0].evidenceKickoffUtc ||
      null,

    requiredProviderEvidence: {
      ...matches[0]
        .requiredProviderEvidence
    }
  };
}

function normalizeTeam(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "");
}

function athensDayFromUtc(value) {
  const date = new Date(clean(value));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-CA", {
    timeZone: "Europe/Athens"
  });
}

function scoreIsAbsent(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

// The historical allow-list remains authoritative for cross-provider or
// rescheduled-day corrections. A new occurrence may self-promote only when the
// canonical row is already bound to the exact same Flashscore provider ID and
// the terminal non-played evidence is complete, scoreless, same-day and ordered
// team exact. This removes the daily operator decision without weakening the
// identity boundary.
export function resolveVerifiedFlashscoreNonPlayedDecision({
  dayKey,
  canonicalId,
  matchId,
  leagueSlug,
  providerMatchId,
  canonicalSource,
  canonicalProviderMatchId,
  canonicalHomeTeam,
  canonicalAwayTeam,
  canonicalKickoffUtc,
  canonicalStatus,
  canonicalRawStatus,
  canonicalStatusType,
  canonicalScoreHome,
  canonicalScoreAway,
  sourceHomeTeam,
  sourceAwayTeam,
  sourceKickoffUtc,
  statusCode,
  statusDetailCode,
  nonPlayedTerminal,
  playedFinal,
  finished,
  scoreHome,
  scoreAway
} = {}) {
  const approved =
    resolveApprovedFlashscoreNonPlayedDecision({
      dayKey,
      canonicalId,
      matchId,
      providerMatchId
    });

  if (approved) {
    return {
      ...approved,
      decisionMode: "approved_occurrence"
    };
  }

  const requestedDay = clean(dayKey);
  const requestedCanonicalId = clean(canonicalId || matchId);
  const requestedProviderId = clean(providerMatchId);
  const boundProviderId = clean(canonicalProviderMatchId);
  const canonicalStatusText = [
    canonicalStatus,
    canonicalRawStatus,
    canonicalStatusType
  ]
    .map(value => clean(value).toUpperCase())
    .join(" ");

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(requestedDay) ||
    !requestedCanonicalId ||
    !requestedProviderId ||
    clean(canonicalSource).toLowerCase() !== "flashscore" ||
    boundProviderId !== requestedProviderId ||
    /\b(FT|FINAL|FULL_TIME|STATUS_FINAL(?:_AET|_PEN)?|STATUS_FULL_TIME(?:_AET|_PEN)?)\b/u
      .test(canonicalStatusText) ||
    !scoreIsAbsent(canonicalScoreHome) ||
    !scoreIsAbsent(canonicalScoreAway) ||
    nonPlayedTerminal !== true ||
    playedFinal === true ||
    finished === true ||
    clean(statusCode) !== "3" ||
    clean(statusDetailCode) !== "4" ||
    !scoreIsAbsent(scoreHome) ||
    !scoreIsAbsent(scoreAway) ||
    athensDayFromUtc(canonicalKickoffUtc) !== requestedDay ||
    athensDayFromUtc(sourceKickoffUtc) !== requestedDay ||
    !normalizeTeam(canonicalHomeTeam) ||
    !normalizeTeam(canonicalAwayTeam) ||
    normalizeTeam(canonicalHomeTeam) !== normalizeTeam(sourceHomeTeam) ||
    normalizeTeam(canonicalAwayTeam) !== normalizeTeam(sourceAwayTeam)
  ) {
    return null;
  }

  return {
    decisionId:
      `flashscore-nonplayed-auto-${requestedDay.replace(/-/gu, "")}-${requestedProviderId}-v1`,
    policyVersion: "flashscore-nonplayed-autonomous-v1",
    decisionMode: "autonomous_exact_provider_occurrence",
    dayKey: requestedDay,
    canonicalId: requestedCanonicalId,
    leagueSlug: clean(leagueSlug) || null,
    provider: "flashscore",
    providerMatchId: requestedProviderId,
    resolvedStatus: "STATUS_POSTPONED",
    decisionBasis: "exact_provider_id_same_day_ordered_team_terminal_nonplayed",
    evidenceDayKey: null,
    evidenceKickoffUtc: null,
    requiredProviderEvidence: {
      statusCode: "3",
      statusDetailCode: "4",
      scores: "absent"
    }
  };
}
