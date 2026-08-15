import { sameTeamName } from "./fixture-dedup.js";
import { classifyMatchState, MATCH_STATE_CLASS } from "./non-played-state.js";
import { findCanonicalStatusConflicts } from "./canonical-status-coherence.js";

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return (
    Number.isInteger(number) &&
    number >= 0
  )
    ? number
    : null;
}

function scorePair(row) {
  const home = strictScore(
    row?.scoreHome ??
    row?.homeScore ??
    row?.home ??
    row?.finalScore?.homeScore ??
    row?.finalScore?.home
  );

  const away = strictScore(
    row?.scoreAway ??
    row?.awayScore ??
    row?.away ??
    row?.finalScore?.awayScore ??
    row?.finalScore?.away
  );

  return (
    home === null ||
    away === null
  )
    ? null
    : { home, away };
}

function sameScore(left, right) {
  return Boolean(
    left &&
    right &&
    left.home === right.home &&
    left.away === right.away
  );
}

function rowId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.id
  );
}

function sameKickoff(left, right) {
  const a = Date.parse(clean(left));
  const b = Date.parse(clean(right));

  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 60_000
  );
}

function exactIdentityContract(writeback) {
  const identity =
    writeback?.identityContract;

  return Boolean(
    identity?.exactProviderId === true &&
    identity?.athensDay === true &&
    identity?.orderedTeamPair === true &&
    identity?.explicitTerminalStatus === true &&
    identity?.numericScore === true &&
    identity?.heuristicIdentity === false
  );
}

function conflictSurfaces(row) {
  return [
    ...new Set(
      findCanonicalStatusConflicts(
        { fixtures: [row] }
      ).map(
        conflict =>
          conflict.surface
      )
    )
  ].sort();
}

function exactProviderEvidence({
  canonicalRow,
  finalResult,
  dayKey
}) {
  if (
    finalResult?.verifiedFinalTruth !==
      true
  ) {
    return {
      ok: false,
      reason:
        "verified_final_truth_required"
    };
  }

  const canonicalId =
    rowId(canonicalRow);

  if (
    !canonicalId ||
    rowId(finalResult) !==
      canonicalId
  ) {
    return {
      ok: false,
      reason:
        "canonical_id_mismatch"
    };
  }

  if (
    clean(
      finalResult?.dayKey ||
      finalResult?.date
    ) !== dayKey
  ) {
    return {
      ok: false,
      reason:
        "final_day_mismatch"
    };
  }

  const leagueSlug =
    clean(
      canonicalRow?.leagueSlug ||
      finalResult?.leagueSlug
    );

  if (
    clean(canonicalRow?.leagueSlug) &&
    clean(finalResult?.leagueSlug) &&
    clean(canonicalRow.leagueSlug) !==
      clean(finalResult.leagueSlug)
  ) {
    return {
      ok: false,
      reason:
        "league_slug_mismatch"
    };
  }

  if (
    !sameTeamName(
      leagueSlug,
      canonicalRow?.homeTeam,
      finalResult?.homeTeam
    ) ||
    !sameTeamName(
      leagueSlug,
      canonicalRow?.awayTeam,
      finalResult?.awayTeam
    )
  ) {
    return {
      ok: false,
      reason:
        "final_team_pair_mismatch"
    };
  }

  if (
    !sameKickoff(
      canonicalRow?.kickoffUtc,
      finalResult?.kickoffUtc
    )
  ) {
    return {
      ok: false,
      reason:
        "final_kickoff_mismatch"
    };
  }

  const canonicalScore =
    scorePair(canonicalRow);

  const finalScore =
    scorePair(finalResult);

  if (
    !sameScore(
      canonicalScore,
      finalScore
    )
  ) {
    return {
      ok: false,
      reason:
        "final_score_mismatch"
    };
  }

  const provider =
    clean(
      canonicalRow?.source
    ).toLowerCase();

  const providerMatchId =
    clean(
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId
    );

  if (
    !provider ||
    !providerMatchId
  ) {
    return {
      ok: false,
      reason:
        "canonical_provider_identity_required"
    };
  }

  const sources =
    Array.isArray(finalResult?.sources)
      ? finalResult.sources
      : [];

  const evidence =
    sources.find(source =>
      clean(
        source?.provider
      ).toLowerCase() === provider &&
      clean(
        source?.providerMatchId
      ) === providerMatchId
    ) || null;

  if (!evidence) {
    return {
      ok: false,
      reason:
        "exact_provider_evidence_missing"
    };
  }

  if (
    !sameScore(
      canonicalScore,
      scorePair(evidence)
    )
  ) {
    return {
      ok: false,
      reason:
        "provider_evidence_score_mismatch"
    };
  }

  if (
    !sameTeamName(
      leagueSlug,
      canonicalRow?.homeTeam,
      evidence?.home ??
        evidence?.homeTeam
    ) ||
    !sameTeamName(
      leagueSlug,
      canonicalRow?.awayTeam,
      evidence?.away ??
        evidence?.awayTeam
    )
  ) {
    return {
      ok: false,
      reason:
        "provider_evidence_team_pair_mismatch"
    };
  }

  if (
    !sameKickoff(
      canonicalRow?.kickoffUtc,
      evidence?.kickoffUtc
    )
  ) {
    return {
      ok: false,
      reason:
        "provider_evidence_kickoff_mismatch"
    };
  }

  return {
    ok: true,
    reason: null,
    evidence,
    canonicalScore,
    finalResultGeneratedAt:
      finalResult?.generatedAt ??
      null
  };
}

function priorAuthorizedTruthEvidence({
  canonicalRow,
  dayKey,
  canonicalScore
}) {
  const canonicalId =
    rowId(canonicalRow);

  const truthRepair =
    canonicalRow?.canonicalTruthRepair;

  if (
    truthRepair?.schema ===
      "ai-matchlab.canonical-verified-final-repair.v1" &&
    truthRepair?.verifiedFinalTruth === true &&
    truthRepair?.method ===
      "exact_identity_verified_final_truth_repair" &&
    clean(truthRepair?.canonicalId) ===
      canonicalId &&
    clean(truthRepair?.dayKey) ===
      dayKey &&
    truthRepair?.scoreWasCopiedFromVerifiedFinal ===
      true &&
    truthRepair?.statusWasNormalizedToTerminal ===
      true &&
    sameScore(
      canonicalScore,
      scorePair(
        truthRepair?.verifiedFinalScore
      )
    )
  ) {
    return {
      ok: true,
      mode:
        "canonical_truth_repair_invalidates_stale_nested_score",
      source:
        "canonicalTruthRepair",
      generatedAt:
        truthRepair?.repairedAt ??
        null
    };
  }

  const adjudication =
    canonicalRow?.finalTruthAdjudication;

  if (
    adjudication?.schema ===
      "ai-matchlab.final-truth-adjudication.v1" &&
    adjudication?.state ===
      "APPLIED" &&
    clean(adjudication?.matchId) ===
      canonicalId &&
    clean(adjudication?.dayKey) ===
      dayKey &&
    adjudication?.silentOverwriteForbidden ===
      true &&
    sameScore(
      canonicalScore,
      scorePair(
        adjudication?.correctedScore
      )
    )
  ) {
    return {
      ok: true,
      mode:
        "final_truth_adjudication_invalidates_stale_nested_score",
      source:
        "finalTruthAdjudication",
      generatedAt:
        adjudication?.appliedAt ??
        null
    };
  }

  return {
    ok: false,
    mode: null,
    source: null,
    generatedAt: null
  };
}

export function evaluateCanonicalNestedWritebackRepair({
  canonicalRow,
  finalResult = null,
  dayKey
} = {}) {
  const surfaces =
    conflictSurfaces(
      canonicalRow
    );

  if (surfaces.length === 0) {
    return {
      ok: false,
      reason:
        "canonical_already_coherent"
    };
  }

  if (
    surfaces.length !== 1 ||
    surfaces[0] !==
      "authoritativeTerminalWriteback.observation"
  ) {
    return {
      ok: false,
      reason:
        "top_level_conflict_not_eligible"
    };
  }

  if (
    classifyMatchState(
      canonicalRow
    ) !==
      MATCH_STATE_CLASS.PLAYED_FINAL
  ) {
    return {
      ok: false,
      reason:
        "coherent_played_final_top_level_required"
    };
  }

  const writeback =
    canonicalRow
      ?.authoritativeTerminalWriteback;

  const observation =
    writeback?.observation;

  if (
    !observation ||
    classifyMatchState(
      observation
    ) !==
      MATCH_STATE_CLASS.CONFLICT
  ) {
    return {
      ok: false,
      reason:
        "conflicting_nested_observation_required"
    };
  }

  if (
    !exactIdentityContract(
      writeback
    )
  ) {
    return {
      ok: false,
      reason:
        "exact_identity_contract_required"
    };
  }

  const requestedDay =
    clean(
      dayKey ||
      canonicalRow?.dayKey
    );

  if (
    !requestedDay ||
    clean(
      canonicalRow?.dayKey
    ) !== requestedDay ||
    clean(
      writeback?.dayKey
    ) !== requestedDay
  ) {
    return {
      ok: false,
      reason:
        "day_key_mismatch"
    };
  }

  const canonicalProviderId =
    clean(
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId
    );

  const writebackProviderId =
    clean(
      writeback?.providerMatchId
    );

  if (
    !canonicalProviderId ||
    canonicalProviderId !==
      writebackProviderId
  ) {
    return {
      ok: false,
      reason:
        "provider_id_mismatch"
    };
  }

  const canonicalScore =
    scorePair(canonicalRow);

  const observationScore =
    scorePair(observation);

  if (
    !canonicalScore ||
    !observationScore
  ) {
    return {
      ok: false,
      reason:
        "numeric_score_required"
    };
  }

  if (
    sameScore(
      canonicalScore,
      observationScore
    )
  ) {
    return {
      ok: true,
      reason: null,
      mode:
        "score_consistent_nested_sync",
      canonicalScore,
      finalEvidence:
        null
    };
  }

  const authorizedTruthEvidence =
    priorAuthorizedTruthEvidence({
      canonicalRow,
      dayKey:
        requestedDay,
      canonicalScore
    });

  if (authorizedTruthEvidence.ok) {
    return {
      ok: true,
      reason: null,
      mode:
        authorizedTruthEvidence.mode,
      canonicalScore,
      finalEvidence: {
        evidence: null,
        authority:
          authorizedTruthEvidence.source,
        finalResultGeneratedAt:
          authorizedTruthEvidence.generatedAt
      }
    };
  }

  const finalEvidence =
    exactProviderEvidence({
      canonicalRow,
      finalResult,
      dayKey:
        requestedDay
    });

  if (!finalEvidence.ok) {
    return {
      ok: false,
      reason:
        finalEvidence.reason
    };
  }

  return {
    ok: true,
    reason: null,
    mode:
      "verified_final_invalidates_stale_nested_score",
    canonicalScore,
    finalEvidence
  };
}

export function applyCanonicalNestedWritebackRepair({
  canonicalRow,
  finalResult = null,
  dayKey,
  repairedAt =
    new Date().toISOString()
} = {}) {
  const evaluation =
    evaluateCanonicalNestedWritebackRepair({
      canonicalRow,
      finalResult,
      dayKey
    });

  if (!evaluation.ok) {
    return {
      changed: false,
      reason:
        evaluation.reason,
      row:
        canonicalRow,
      evaluation
    };
  }

  const previousObservation =
    canonicalRow
      ?.authoritativeTerminalWriteback
      ?.observation ??
    null;

  const coherentObservation = {
    status:
      canonicalRow?.status ??
      "FT",

    statusType:
      canonicalRow?.statusType ??
      "STATUS_FINAL",

    rawStatus:
      canonicalRow?.rawStatus ??
      "STATUS_FULL_TIME",

    scoreHome:
      evaluation
        .canonicalScore
        .home,

    scoreAway:
      evaluation
        .canonicalScore
        .away
  };

  const row = {
    ...canonicalRow,

    authoritativeTerminalWriteback: {
      ...canonicalRow
        .authoritativeTerminalWriteback,

      observation:
        coherentObservation
    },

    nestedWritebackCoherenceRepair: {
      schema:
        "ai-matchlab.canonical-nested-writeback-coherence-repair.v1",

      repairedAt,

      reason:
        evaluation.mode,

      canonicalId:
        rowId(
          canonicalRow
        ),

      dayKey:
        clean(
          dayKey ||
          canonicalRow?.dayKey
        ),

      provider:
        clean(
          canonicalRow?.source
        ) || null,

      providerMatchId:
        clean(
          canonicalRow?.sourceId ||
          canonicalRow?.sourceMatchId
        ) || null,

      finalResultGeneratedAt:
        evaluation
          .finalEvidence
          ?.finalResultGeneratedAt ??
        null,

      previousObservation,

      correctedTo:
        coherentObservation
    }
  };

  const remaining =
    findCanonicalStatusConflicts(
      { fixtures: [row] }
    );

  if (
    remaining.length > 0
  ) {
    const error =
      new Error(
        `canonical_nested_writeback_repair_postcondition_failed:${remaining.length}`
      );

    error.conflicts =
      remaining;

    throw error;
  }

  return {
    changed: true,
    reason: null,
    row,
    evaluation
  };
}
