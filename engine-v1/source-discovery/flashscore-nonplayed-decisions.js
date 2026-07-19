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

    requiredProviderEvidence: {
      ...matches[0]
        .requiredProviderEvidence
    }
  };
}
