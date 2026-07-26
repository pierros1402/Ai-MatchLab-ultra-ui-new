/**
 * Immutable expected → canonical fixture identity decisions.
 *
 * These decisions bridge historical expected-match CIDs to the exact
 * canonical fixture CIDs observed for the same Athens day. They are not
 * fuzzy aliases and must never be applied outside the pinned day.
 */

const DECISIONS = Object.freeze([
  Object.freeze({
    dayKey: "2026-07-25",
    expectedMatchId:
      "cid_col1_depcali_jaguarescordoba_20260725",
    canonicalId:
      "cid_col1_deportivocali_jaguarescordoba_20260725",
    reason:
      "expected_abbreviation_to_exact_espn_canonical"
  }),

  Object.freeze({
    dayKey: "2026-07-25",
    expectedMatchId:
      "cid_per1_udeportes_cusco_20260725",
    canonicalId:
      "cid_per1_universitario_cusco_20260725",
    reason:
      "expected_abbreviation_to_exact_espn_canonical"
  }),

  Object.freeze({
    dayKey: "2026-07-25",
    expectedMatchId:
      "cid_uru1_centralesp_cerrolargo_20260725",
    canonicalId:
      "cid_uru1_centralespanolfutbol_cerrolargo_20260725",
    reason:
      "expected_abbreviation_to_exact_espn_canonical"
  }),

  Object.freeze({
    dayKey: "2026-07-25",
    expectedMatchId:
      "cid_chi1_coquimbo_uconcepcion_20260725",
    canonicalId:
      "cid_chi1_coquimbounido_universidadconcepcion_20260725",
    reason:
      "expected_abbreviation_to_exact_postponed_canonical"
  })
]);

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function expectedCanonicalIdentityDecisions() {
  return DECISIONS.map(
    decision => ({
      ...decision
    })
  );
}

export function resolveExpectedCanonicalIdentityDecision({
  dayKey,
  expectedMatchId
} = {}) {
  const requestedDay =
    clean(dayKey);

  const requestedExpectedId =
    clean(expectedMatchId);

  if (
    !requestedDay ||
    !requestedExpectedId
  ) {
    return null;
  }

  const matches =
    DECISIONS.filter(
      decision =>
        decision.dayKey ===
          requestedDay &&
        decision.expectedMatchId ===
          requestedExpectedId
    );

  if (matches.length !== 1) {
    return null;
  }

  return {
    ...matches[0]
  };
}
