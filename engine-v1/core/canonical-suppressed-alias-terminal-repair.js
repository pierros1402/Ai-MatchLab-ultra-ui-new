import { sameTeamName } from "./fixture-dedup.js";
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

function matchingSourceFixture({
  canonicalRow,
  identityDecision,
  dayKey
}) {
  const canonicalId =
    rowId(canonicalRow);

  const provider =
    clean(canonicalRow?.source)
      .toLowerCase();

  const providerMatchId =
    clean(
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId
    );

  const leagueSlug =
    clean(canonicalRow?.leagueSlug);

  const sourceFixtures =
    Array.isArray(
      identityDecision?.sourceFixtures
    )
      ? identityDecision.sourceFixtures
      : [];

  return sourceFixtures.find(source =>
    clean(source?.repositoryFixtureId) ===
      canonicalId &&
    clean(source?.provider)
      .toLowerCase() === provider &&
    clean(source?.providerMatchId) ===
      providerMatchId &&
    clean(source?.dayKey) ===
      dayKey &&
    (!leagueSlug ||
      clean(source?.leagueSlug) ===
        leagueSlug) &&
    sameKickoff(
      source?.kickoffUtc,
      canonicalRow?.kickoffUtc
    ) &&
    sameTeamName(
      leagueSlug,
      canonicalRow?.homeTeam,
      source?.homeTeam
    ) &&
    sameTeamName(
      leagueSlug,
      canonicalRow?.awayTeam,
      source?.awayTeam
    )
  ) || null;
}

export function evaluateCanonicalSuppressedAliasTerminalRepair({
  canonicalRow,
  identityDecision,
  evidence,
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

  if (!surfaces.includes("canonical")) {
    return {
      ok: false,
      reason:
        "top_level_conflict_required"
    };
  }

  const canonicalId =
    rowId(canonicalRow);

  const requestedDay =
    clean(
      dayKey ||
      canonicalRow?.dayKey
    );

  if (
    !canonicalId ||
    !requestedDay ||
    clean(canonicalRow?.dayKey) !==
      requestedDay
  ) {
    return {
      ok: false,
      reason:
        "canonical_identity_required"
    };
  }

  if (
    !exactIdentityContract(
      canonicalRow
        ?.authoritativeTerminalWriteback
    )
  ) {
    return {
      ok: false,
      reason:
        "exact_identity_contract_required"
    };
  }

  const suppressedIds =
    Array.isArray(
      identityDecision
        ?.suppressedRepositoryFixtureIds
    )
      ? identityDecision
          .suppressedRepositoryFixtureIds
          .map(clean)
      : [];

  const retainedFixtureId =
    clean(
      identityDecision
        ?.retainedRepositoryFixtureId
    );

  const decisionId =
    clean(
      identityDecision
        ?.fixtureRetentionDecisionId
    );

  if (
    !decisionId ||
    !retainedFixtureId ||
    !clean(
      identityDecision?.promotionBasis
    ).startsWith(
      "TWO_PROVIDER_"
    ) ||
    !suppressedIds.includes(
      canonicalId
    ) ||
    clean(identityDecision?.dayKey) !==
      requestedDay ||
    (
      clean(canonicalRow?.leagueSlug) &&
      clean(identityDecision?.leagueSlug) !==
        clean(canonicalRow?.leagueSlug)
    )
  ) {
    return {
      ok: false,
      reason:
        "approved_identity_decision_required"
    };
  }

  const sourceFixture =
    matchingSourceFixture({
      canonicalRow,
      identityDecision,
      dayKey:
        requestedDay
    });

  if (!sourceFixture) {
    return {
      ok: false,
      reason:
        "identity_source_fixture_mismatch"
    };
  }

  const retainedSourceFixture =
    (
      Array.isArray(
        identityDecision?.sourceFixtures
      )
        ? identityDecision.sourceFixtures
        : []
    ).find(source =>
      clean(source?.repositoryFixtureId) ===
        retainedFixtureId &&
      clean(source?.dayKey) ===
        requestedDay &&
      (
        !clean(canonicalRow?.leagueSlug) ||
        clean(source?.leagueSlug) ===
          clean(canonicalRow?.leagueSlug)
      ) &&
      sameKickoff(
        source?.kickoffUtc,
        canonicalRow?.kickoffUtc
      )
    ) || null;

  if (!retainedSourceFixture) {
    return {
      ok: false,
      reason:
        "identity_retained_fixture_mismatch"
    };
  }

  if (
    evidence?.verifiedFinalTruth !==
      true ||
    clean(evidence?.sourceFixtureId) !==
      canonicalId ||
    clean(evidence?.retainedFixtureId) !==
      retainedFixtureId ||
    clean(evidence?.fixtureRetentionDecisionId) !==
      decisionId ||
    clean(evidence?.dayKey) !==
      requestedDay
  ) {
    return {
      ok: false,
      reason:
        "verified_identity_bound_final_required"
    };
  }

  const leagueSlug =
    clean(canonicalRow?.leagueSlug);

  if (
    evidence?.leagueSlug &&
    clean(evidence.leagueSlug) !==
      leagueSlug
  ) {
    return {
      ok: false,
      reason:
        "evidence_league_mismatch"
    };
  }

  const provider =
    clean(canonicalRow?.source)
      .toLowerCase();

  const providerMatchId =
    clean(
      canonicalRow?.sourceId ||
      canonicalRow?.sourceMatchId
    );

  if (
    clean(evidence?.provider)
      .toLowerCase() !== provider ||
    clean(evidence?.providerMatchId) !==
      providerMatchId
  ) {
    return {
      ok: false,
      reason:
        "evidence_provider_identity_mismatch"
    };
  }

  if (
    !sameTeamName(
      leagueSlug,
      canonicalRow?.homeTeam,
      evidence?.homeTeam
    ) ||
    !sameTeamName(
      leagueSlug,
      canonicalRow?.awayTeam,
      evidence?.awayTeam
    )
  ) {
    return {
      ok: false,
      reason:
        "evidence_team_pair_mismatch"
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
        "evidence_kickoff_mismatch"
    };
  }

  const finalScore =
    scorePair(evidence);

  if (!finalScore) {
    return {
      ok: false,
      reason:
        "numeric_final_score_required"
    };
  }

  return {
    ok: true,
    reason: null,
    mode:
      clean(evidence?.mode) ||
      "identity_bound_verified_final",
    canonicalId,
    retainedFixtureId,
    fixtureRetentionDecisionId:
      decisionId,
    finalScore,
    evidence
  };
}

export function applyCanonicalSuppressedAliasTerminalRepair({
  canonicalRow,
  identityDecision,
  evidence,
  dayKey,
  repairedAt =
    new Date().toISOString()
} = {}) {
  const evaluation =
    evaluateCanonicalSuppressedAliasTerminalRepair({
      canonicalRow,
      identityDecision,
      evidence,
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

  const previousCanonical = {
    status:
      canonicalRow?.status ??
      null,
    statusType:
      canonicalRow?.statusType ??
      null,
    rawStatus:
      canonicalRow?.rawStatus ??
      null,
    operationalState:
      canonicalRow?.operationalState ??
      null,
    minute:
      canonicalRow?.minute ??
      null,
    scoreHome:
      canonicalRow?.scoreHome ??
      null,
    scoreAway:
      canonicalRow?.scoreAway ??
      null
  };

  const previousObservation =
    canonicalRow
      ?.authoritativeTerminalWriteback
      ?.observation ??
    null;

  const coherentObservation = {
    status:
      "FT",
    statusType:
      "STATUS_FINAL",
    rawStatus:
      "STATUS_FINAL",
    scoreHome:
      evaluation.finalScore.home,
    scoreAway:
      evaluation.finalScore.away
  };

  const row = {
    ...canonicalRow,
    status:
      "FT",
    statusType:
      "STATUS_FINAL",
    rawStatus:
      "STATUS_FINAL",
    operationalState:
      "TERMINAL_CONFIRMED",
    minute:
      "FT",
    scoreHome:
      evaluation.finalScore.home,
    scoreAway:
      evaluation.finalScore.away,
    finalized:
      1,
    state:
      "final",
    isDisplayFinal:
      true,
    authoritativeTerminalWriteback: {
      ...canonicalRow
        .authoritativeTerminalWriteback,
      observation:
        coherentObservation
    },
    suppressedAliasTerminalCoherenceRepair: {
      schema:
        "ai-matchlab.canonical-suppressed-alias-terminal-coherence-repair.v1",
      repairedAt,
      reason:
        evaluation.mode,
      canonicalId:
        evaluation.canonicalId,
      dayKey:
        clean(
          dayKey ||
          canonicalRow?.dayKey
        ),
      fixtureRetentionDecisionId:
        evaluation.fixtureRetentionDecisionId,
      retainedFixtureId:
        evaluation.retainedFixtureId,
      provider:
        clean(evidence?.provider) ||
        null,
      providerMatchId:
        clean(evidence?.providerMatchId) ||
        null,
      evidencePath:
        clean(evidence?.evidencePath) ||
        null,
      previousCanonical,
      previousObservation,
      correctedTo: {
        ...coherentObservation,
        operationalState:
          "TERMINAL_CONFIRMED"
      }
    }
  };

  const remaining =
    findCanonicalStatusConflicts(
      { fixtures: [row] }
    );

  if (remaining.length > 0) {
    const error =
      new Error(
        `canonical_suppressed_alias_terminal_repair_postcondition_failed:${remaining.length}`
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
