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
