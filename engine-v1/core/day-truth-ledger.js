import { createHash } from "node:crypto";

import {
  classifyMatchState,
  classifyOperationalMatchState
} from "./non-played-state.js";

export const DAY_TRUTH_LEDGER_SCHEMA =
  "ai-matchlab.day-truth-ledger.v1";

export const DAY_TRUTH_LEDGER_VERSION =
  "1.0.0";

export const DAY_TRUTH_LEDGER_ROLE =
  "derived_control_plane";

export const DAY_TRUTH_LEDGER_AUTHORITY =
  Object.freeze({
    membership:
      "canonical_fixtures",

    operationalState:
      "canonical_fixtures_via_unified_match_state_contract",

    scoredFinalEvidence:
      "verified_final_results",

    historyEligibility:
      "canonical_played_terminal_plus_verified_final",

    scoredSettlementEligibility:
      "canonical_played_terminal_plus_verified_final",

    voidSettlementEligibility:
      "canonical_non_played_terminal_contract",

    downstreamProjections:
      "non_authoritative_observations"
  });

export const DAY_TRUTH_DECISION =
  Object.freeze({
    CONVERGED_PLAYED_FINAL:
      "CONVERGED_PLAYED_FINAL",

    CONVERGED_NON_PLAYED_TERMINAL:
      "CONVERGED_NON_PLAYED_TERMINAL",

    PENDING_VERIFIED_FINAL:
      "PENDING_VERIFIED_FINAL",

    OPEN:
      "OPEN",

    UNRESOLVED:
      "UNRESOLVED",

    CONFLICT:
      "CONFLICT"
  });

const DAY_KEY_RE =
  /^20\d{2}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function cleanNullable(value) {
  const result = clean(value);
  return result || null;
}

function assertExactDayKey(dayKey) {
  const raw = clean(dayKey);

  if (!DAY_KEY_RE.test(raw)) {
    throw new Error(
      `invalid_day_key:${raw || "<empty>"}`
    );
  }

  const [
    year,
    month,
    day
  ] = raw
    .split("-")
    .map(Number);

  const parsed =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(
      `invalid_day_key:${raw}`
    );
  }

  return raw;
}

function assertGeneratedAt(value) {
  const raw = clean(value);
  const parsed = Date.parse(raw);

  if (
    !raw ||
    !Number.isFinite(parsed)
  ) {
    throw new Error(
      "invalid_generated_at"
    );
  }

  return raw;
}

function fixtureId(row) {
  return clean(
    row?.canonicalId ||
    row?.matchId ||
    row?.fixtureId ||
    row?.id
  );
}

function exactScore(row) {
  const rawHome =
    row?.scoreHome ??
    row?.homeScore;

  const rawAway =
    row?.scoreAway ??
    row?.awayScore;

  if (
    rawHome === null ||
    rawHome === undefined ||
    rawHome === "" ||
    rawAway === null ||
    rawAway === undefined ||
    rawAway === ""
  ) {
    return null;
  }

  const scoreHome =
    Number(rawHome);

  const scoreAway =
    Number(rawAway);

  if (
    !Number.isInteger(scoreHome) ||
    !Number.isInteger(scoreAway) ||
    scoreHome < 0 ||
    scoreAway < 0
  ) {
    return null;
  }

  return {
    scoreHome,
    scoreAway,
    scoreKey:
      `${scoreHome}-${scoreAway}`
  };
}

function verifiedVerdict(row) {
  return clean(
    row?.finalTruthVerdict ||
    row?.verdict ||
    row?.verification?.finalTruthVerdict ||
    row?.verification?.verdict
  );
}

function verifiedDayKey(row) {
  return clean(
    row?.dayKey ||
    row?.date
  );
}

function inspectVerifiedFinal(
  row,
  dayKey
) {
  if (!row) {
    return {
      present: false,
      accepted: false,
      reason:
        "verified_final_missing",
      verdict: null,
      dayKey: null,
      scoreHome: null,
      scoreAway: null
    };
  }

  const verdict =
    verifiedVerdict(row);

  const evidenceDayKey =
    verifiedDayKey(row);

  const score =
    exactScore(row);

  if (
    row?.verifiedFinalTruth !== true
  ) {
    return {
      present: true,
      accepted: false,
      reason:
        "verified_final_truth_flag_missing",
      verdict:
        verdict || null,
      dayKey:
        evidenceDayKey || null,
      scoreHome:
        score?.scoreHome ?? null,
      scoreAway:
        score?.scoreAway ?? null
    };
  }

  if (
    verdict !==
    "verified_final_result"
  ) {
    return {
      present: true,
      accepted: false,
      reason:
        "verified_final_verdict_invalid",
      verdict:
        verdict || null,
      dayKey:
        evidenceDayKey || null,
      scoreHome:
        score?.scoreHome ?? null,
      scoreAway:
        score?.scoreAway ?? null
    };
  }

  if (
    evidenceDayKey !== dayKey
  ) {
    return {
      present: true,
      accepted: false,
      reason:
        "verified_final_day_mismatch",
      verdict,
      dayKey:
        evidenceDayKey || null,
      scoreHome:
        score?.scoreHome ?? null,
      scoreAway:
        score?.scoreAway ?? null
    };
  }

  if (!score) {
    return {
      present: true,
      accepted: false,
      reason:
        "verified_final_score_invalid",
      verdict,
      dayKey:
        evidenceDayKey,
      scoreHome: null,
      scoreAway: null
    };
  }

  return {
    present: true,
    accepted: true,
    reason:
      "verified_final_result",
    verdict,
    dayKey:
      evidenceDayKey,
    scoreHome:
      score.scoreHome,
    scoreAway:
      score.scoreAway
  };
}

function normalizeObservedIdSet(
  spec,
  label
) {
  if (spec == null) {
    return {
      observed: false,
      ids: new Set()
    };
  }

  if (
    typeof spec !== "object" ||
    !Array.isArray(
      spec.fixtureIds
    )
  ) {
    throw new Error(
      `invalid_downstream_${label}`
    );
  }

  return {
    observed: true,
    ids:
      new Set(
        spec.fixtureIds
          .map(clean)
          .filter(Boolean)
      )
  };
}

function normalizeSettlement(
  spec
) {
  if (spec == null) {
    return {
      observed: false,
      byCanonicalId:
        Object.create(null)
    };
  }

  if (
    typeof spec !== "object" ||
    spec === null ||
    Array.isArray(spec) ||
    typeof spec.byCanonicalId !==
      "object" ||
    spec.byCanonicalId === null ||
    Array.isArray(
      spec.byCanonicalId
    )
  ) {
    throw new Error(
      "invalid_downstream_settlement"
    );
  }

  const normalized =
    Object.create(null);

  for (
    const [
      id,
      state
    ] of Object.entries(
      spec.byCanonicalId
    )
  ) {
    const canonicalId =
      clean(id);

    if (!canonicalId) {
      continue;
    }

    if (
      state !== null &&
      state !== undefined &&
      typeof state !== "string"
    ) {
      throw new Error(
        `invalid_settlement_state:${canonicalId}`
      );
    }

    normalized[canonicalId] =
      cleanNullable(state);
  }

  return {
    observed: true,
    byCanonicalId:
      normalized
  };
}

function cloneJson(value) {
  if (value == null) {
    return null;
  }

  return JSON.parse(
    JSON.stringify(value)
  );
}

const DOWNSTREAM_CONVERGENCE_STATES =
  new Set([
    "NOT_OBSERVED",
    "PARTIALLY_OBSERVED",
    "CONVERGED",
    "INCOMPLETE",
    "CONFLICT"
  ]);

function normalizeDownstreamConvergence(
  spec,
  truthFingerprint
) {
  if (spec == null) {
    return null;
  }

  if (
    typeof spec !== "object" ||
    Array.isArray(spec)
  ) {
    throw new Error(
      "invalid_downstream_convergence"
    );
  }

  const overallState =
    clean(
      spec?.overallState
    );

  if (
    !DOWNSTREAM_CONVERGENCE_STATES
      .has(overallState)
  ) {
    throw new Error(
      "invalid_downstream_convergence_state"
    );
  }

  if (
    clean(
      spec?.truthFingerprint
    ) !==
    truthFingerprint
  ) {
    throw new Error(
      "downstream_convergence_truth_fingerprint_mismatch"
    );
  }

  for (const key of [
    "history",
    "settlement",
    "publication",
    "systemHealth"
  ]) {
    if (
      typeof spec?.[key] !==
        "object" ||
      spec?.[key] === null ||
      Array.isArray(
        spec?.[key]
      )
    ) {
      throw new Error(
        `invalid_downstream_convergence_${key}`
      );
    }
  }

  const authority =
    spec?.authority;

  if (
    !authority ||
    typeof authority !==
      "object" ||
    Array.isArray(authority) ||
    authority
      .footballTruthMutable !==
      false ||
    authority
      .downstreamMutationAuthorized !==
      false ||
    authority
      .repairAuthorized !==
      false ||
    authority
      .observationsAffectTruthFingerprint !==
      false
  ) {
    throw new Error(
      "invalid_downstream_convergence_authority"
    );
  }

  return cloneJson(spec);
}

function stableValue(value) {
  if (
    value === null ||
    typeof value !== "object"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [
        key,
        stableValue(
          value[key]
        )
      ])
  );
}

function sha256(value) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest("hex");
}

function decisionForFixture({
  operationalState,
  canonicalScore,
  verifiedFinal,
  verifiedFinalCount
}) {
  if (
    verifiedFinalCount > 1
  ) {
    return {
      status:
        DAY_TRUTH_DECISION.CONFLICT,
      reason:
        "duplicate_verified_final_artifacts"
    };
  }

  if (
    operationalState ===
    "CONFLICT"
  ) {
    return {
      status:
        DAY_TRUTH_DECISION.CONFLICT,
      reason:
        "canonical_state_conflict"
    };
  }

  if (
    operationalState ===
    "UNRESOLVED"
  ) {
    if (
      verifiedFinalCount > 0
    ) {
      return {
        status:
          DAY_TRUTH_DECISION.CONFLICT,
        reason:
          "verified_final_conflicts_with_unresolved_canonical_state"
      };
    }

    return {
      status:
        DAY_TRUTH_DECISION.UNRESOLVED,
      reason:
        "canonical_state_unresolved"
    };
  }

  if (
    operationalState ===
    "PLAYED_TERMINAL"
  ) {
    if (
      verifiedFinalCount === 0
    ) {
      return {
        status:
          DAY_TRUTH_DECISION.PENDING_VERIFIED_FINAL,
        reason:
          "played_terminal_requires_verified_final"
      };
    }

    if (
      verifiedFinal.accepted !==
      true
    ) {
      return {
        status:
          DAY_TRUTH_DECISION.CONFLICT,
        reason:
          verifiedFinal.reason ||
          "verified_final_invalid"
      };
    }

    if (!canonicalScore) {
      return {
        status:
          DAY_TRUTH_DECISION.CONFLICT,
        reason:
          "canonical_played_final_score_invalid"
      };
    }

    if (
      canonicalScore.scoreHome !==
        verifiedFinal.scoreHome ||
      canonicalScore.scoreAway !==
        verifiedFinal.scoreAway
    ) {
      return {
        status:
          DAY_TRUTH_DECISION.CONFLICT,
        reason:
          "canonical_verified_final_score_mismatch"
      };
    }

    return {
      status:
        DAY_TRUTH_DECISION.CONVERGED_PLAYED_FINAL,
      reason:
        "canonical_and_verified_final_converged"
    };
  }

  if (
    operationalState ===
    "NON_PLAYED_TERMINAL"
  ) {
    if (
      verifiedFinalCount > 0
    ) {
      return {
        status:
          DAY_TRUTH_DECISION.CONFLICT,
        reason:
          "verified_final_conflicts_with_nonplayed_terminal"
      };
    }

    return {
      status:
        DAY_TRUTH_DECISION.CONVERGED_NON_PLAYED_TERMINAL,
      reason:
        "explicit_nonplayed_terminal"
    };
  }

  if (
    verifiedFinalCount > 0
  ) {
    return {
      status:
        DAY_TRUTH_DECISION.CONFLICT,
      reason:
        "verified_final_conflicts_with_open_canonical_state"
    };
  }

  return {
    status:
      DAY_TRUTH_DECISION.OPEN,
    reason:
      `canonical_${String(
        operationalState
      ).toLowerCase()}`
  };
}

function ledgerStateFromSummary(
  summary
) {
  if (
    summary.canonicalRows === 0 &&
    summary.orphanVerifiedFinals ===
      0
  ) {
    return "EMPTY";
  }

  if (
    summary.conflictRows > 0 ||
    summary.orphanVerifiedFinals > 0
  ) {
    return "CONFLICT";
  }

  if (
    summary.pendingVerifiedFinal >
      0 ||
    summary.unresolvedRows > 0
  ) {
    return "INCOMPLETE";
  }

  if (
    summary.openRows > 0
  ) {
    return "OPEN";
  }

  return "CLOSED";
}

export function buildDayTruthLedger({
  dayKey,
  generatedAt,
  canonicalRows = [],
  verifiedFinalRows = [],
  downstream = {},
  downstreamConvergence = null,
  provenance = {}
} = {}) {
  const exactDayKey =
    assertExactDayKey(dayKey);

  const exactGeneratedAt =
    assertGeneratedAt(
      generatedAt
    );

  if (
    !Array.isArray(canonicalRows)
  ) {
    throw new Error(
      "canonical_rows_must_be_array"
    );
  }

  if (
    !Array.isArray(
      verifiedFinalRows
    )
  ) {
    throw new Error(
      "verified_final_rows_must_be_array"
    );
  }

  const history =
    normalizeObservedIdSet(
      downstream?.history,
      "history"
    );

  const publication =
    normalizeObservedIdSet(
      downstream?.publication,
      "publication"
    );

  const settlement =
    normalizeSettlement(
      downstream?.settlement
    );

  const systemHealthObserved =
    downstream?.systemHealth != null;

  const canonicalById =
    new Map();

  for (const row of canonicalRows) {
    const id =
      fixtureId(row);

    if (!id) {
      throw new Error(
        "canonical_fixture_missing_id"
      );
    }

    if (
      canonicalById.has(id)
    ) {
      throw new Error(
        `duplicate_canonical_fixture_id:${id}`
      );
    }

    const rowDay =
      clean(
        row?.dayKey ||
        row?.date
      );

    if (
      rowDay &&
      rowDay !== exactDayKey
    ) {
      throw new Error(
        `canonical_fixture_day_mismatch:${id}:${rowDay}`
      );
    }

    canonicalById.set(
      id,
      row
    );
  }

  const verifiedById =
    new Map();

  const orphanVerifiedFinals =
    [];

  let acceptedVerifiedFinalArtifacts =
    0;

  for (
    const row of verifiedFinalRows
  ) {
    const id =
      fixtureId(row);

    const inspected =
      inspectVerifiedFinal(
        row,
        exactDayKey
      );

    if (inspected.accepted) {
      acceptedVerifiedFinalArtifacts++;
    }

    if (!id) {
      orphanVerifiedFinals.push({
        canonicalId: null,
        reason:
          "verified_final_missing_canonical_id"
      });

      continue;
    }

    if (
      !canonicalById.has(id)
    ) {
      orphanVerifiedFinals.push({
        canonicalId: id,
        reason:
          "verified_final_missing_canonical_membership"
      });

      continue;
    }

    if (
      !verifiedById.has(id)
    ) {
      verifiedById.set(
        id,
        []
      );
    }

    verifiedById
      .get(id)
      .push(row);
  }

  const duplicateVerifiedFinalFixtureIds =
    [...verifiedById.entries()]
      .filter(
        ([, rows]) =>
          rows.length > 1
      )
      .map(([id]) => id)
      .sort();

  const fixtures = [];

  for (
    const [
      id,
      row
    ] of canonicalById.entries()
  ) {
    const baseState =
      classifyMatchState(row);

    const operationalState =
      classifyOperationalMatchState(
        row
      );

    const canonicalScore =
      exactScore(row);

    const verifiedRows =
      verifiedById.get(id) ||
      [];

    let verifiedFinal;

    if (
      verifiedRows.length === 0
    ) {
      verifiedFinal =
        inspectVerifiedFinal(
          null,
          exactDayKey
        );
    }
    else if (
      verifiedRows.length === 1
    ) {
      verifiedFinal =
        inspectVerifiedFinal(
          verifiedRows[0],
          exactDayKey
        );
    }
    else {
      verifiedFinal = {
        present: true,
        accepted: false,
        reason:
          "duplicate_verified_final_artifacts",
        verdict: null,
        dayKey: null,
        scoreHome: null,
        scoreAway: null
      };
    }

    const scoreParity =
      verifiedRows.length === 1 &&
      canonicalScore &&
      verifiedFinal.scoreHome !==
        null &&
      verifiedFinal.scoreAway !==
        null
        ? (
            canonicalScore.scoreHome ===
              verifiedFinal.scoreHome &&
            canonicalScore.scoreAway ===
              verifiedFinal.scoreAway
          )
        : null;

    const decisionBase =
      decisionForFixture({
        operationalState,
        canonicalScore,
        verifiedFinal,
        verifiedFinalCount:
          verifiedRows.length
      });

    const convergedPlayed =
      decisionBase.status ===
      DAY_TRUTH_DECISION
        .CONVERGED_PLAYED_FINAL;

    const convergedNonPlayed =
      decisionBase.status ===
      DAY_TRUTH_DECISION
        .CONVERGED_NON_PLAYED_TERMINAL;

    const operationallyClosed =
      operationalState ===
        "PLAYED_TERMINAL" ||
      operationalState ===
        "NON_PLAYED_TERMINAL";

    const historyEligible =
      convergedPlayed;

    const scoredSettlementEligible =
      convergedPlayed;

    const voidSettlementEligible =
      convergedNonPlayed;

    const historyPresent =
      history.observed
        ? history.ids.has(id)
        : null;

    const publicationPresent =
      publication.observed
        ? publication.ids.has(id)
        : null;

    const settlementState =
      settlement.observed
        ? (
            Object.prototype
              .hasOwnProperty
              .call(
                settlement
                  .byCanonicalId,
                id
              )
              ? settlement
                  .byCanonicalId[id]
              : null
          )
        : null;

    fixtures.push({
      canonicalId: id,

      leagueSlug:
        cleanNullable(
          row?.leagueSlug
        ),

      homeTeam:
        cleanNullable(
          row?.homeTeam ||
          row?.home
        ),

      awayTeam:
        cleanNullable(
          row?.awayTeam ||
          row?.away
        ),

      kickoffUtc:
        cleanNullable(
          row?.kickoffUtc ||
          row?.kickoff
        ),

      baseState,
      operationalState,

      canonical: {
        status:
          cleanNullable(
            row?.status
          ),

        statusType:
          cleanNullable(
            row?.statusType
          ),

        rawStatus:
          cleanNullable(
            row?.rawStatus
          ),

        scoreHome:
          canonicalScore
            ?.scoreHome ??
          null,

        scoreAway:
          canonicalScore
            ?.scoreAway ??
          null
      },

      verifiedFinal: {
        present:
          verifiedFinal.present,

        accepted:
          verifiedFinal.accepted,

        reason:
          verifiedFinal.reason ??
          null,

        verdict:
          verifiedFinal.verdict ??
          null,

        dayKey:
          verifiedFinal.dayKey ??
          null,

        scoreHome:
          verifiedFinal.scoreHome ??
          null,

        scoreAway:
          verifiedFinal.scoreAway ??
          null,

        scoreParity
      },

      decision: {
        status:
          decisionBase.status,

        reason:
          decisionBase.reason,

        operationallyClosed,

        historyEligible,

        scoredSettlementEligible,

        voidSettlementEligible,

        repairAuthorized:
          false
      },

      downstream: {
        history: {
          observed:
            history.observed,

          present:
            historyPresent
        },

        settlement: {
          observed:
            settlement.observed,

          state:
            settlementState
        },

        publication: {
          observed:
            publication.observed,

          present:
            publicationPresent
        }
      }
    });
  }

  fixtures.sort(
    (left, right) =>
      left.canonicalId
        .localeCompare(
          right.canonicalId
        )
  );

  const summary = {
    canonicalRows:
      fixtures.length,

    playedTerminal: 0,
    nonPlayedTerminal: 0,
    scheduled: 0,
    live: 0,
    interrupted: 0,
    delayed: 0,
    operationalConflict: 0,
    operationalUnresolved: 0,

    verifiedFinalArtifacts:
      verifiedFinalRows.length,

    acceptedVerifiedFinalArtifacts,

    convergedPlayedFinal: 0,
    convergedNonPlayedTerminal: 0,
    pendingVerifiedFinal: 0,
    openRows: 0,
    unresolvedRows: 0,
    conflictRows: 0,

    orphanVerifiedFinals:
      orphanVerifiedFinals.length,

    duplicateVerifiedFinalFixtureIds:
      duplicateVerifiedFinalFixtureIds
        .length,

    historyEligible: 0,
    scoredSettlementEligible: 0,
    voidSettlementEligible: 0
  };

  for (const row of fixtures) {
    switch (
      row.operationalState
    ) {
      case "PLAYED_TERMINAL":
        summary.playedTerminal++;
        break;

      case "NON_PLAYED_TERMINAL":
        summary.nonPlayedTerminal++;
        break;

      case "SCHEDULED":
        summary.scheduled++;
        break;

      case "LIVE":
        summary.live++;
        break;

      case "INTERRUPTED":
        summary.interrupted++;
        break;

      case "DELAYED":
        summary.delayed++;
        break;

      case "CONFLICT":
        summary.operationalConflict++;
        break;

      default:
        summary.operationalUnresolved++;
        break;
    }

    switch (
      row.decision.status
    ) {
      case "CONVERGED_PLAYED_FINAL":
        summary.convergedPlayedFinal++;
        break;

      case "CONVERGED_NON_PLAYED_TERMINAL":
        summary.convergedNonPlayedTerminal++;
        break;

      case "PENDING_VERIFIED_FINAL":
        summary.pendingVerifiedFinal++;
        break;

      case "OPEN":
        summary.openRows++;
        break;

      case "UNRESOLVED":
        summary.unresolvedRows++;
        break;

      case "CONFLICT":
        summary.conflictRows++;
        break;
    }

    if (
      row.decision
        .historyEligible
    ) {
      summary.historyEligible++;
    }

    if (
      row.decision
        .scoredSettlementEligible
    ) {
      summary
        .scoredSettlementEligible++;
    }

    if (
      row.decision
        .voidSettlementEligible
    ) {
      summary
        .voidSettlementEligible++;
    }
  }

  const conflictFixtureIds =
    fixtures
      .filter(
        row =>
          row.decision.status ===
          "CONFLICT"
      )
      .map(
        row =>
          row.canonicalId
      );

  const pendingVerifiedFinalFixtureIds =
    fixtures
      .filter(
        row =>
          row.decision.status ===
          "PENDING_VERIFIED_FINAL"
      )
      .map(
        row =>
          row.canonicalId
      );

  const truthFingerprint =
    sha256({
      schema:
        DAY_TRUTH_LEDGER_SCHEMA,

      dayKey:
        exactDayKey,

      authority:
        DAY_TRUTH_LEDGER_AUTHORITY,

      fixtures:
        fixtures.map(row => ({
          canonicalId:
            row.canonicalId,

          baseState:
            row.baseState,

          operationalState:
            row.operationalState,

          canonical:
            row.canonical,

          verifiedFinal:
            row.verifiedFinal,

          decision:
            row.decision
        })),

      anomalies: {
        orphanVerifiedFinals,
        duplicateVerifiedFinalFixtureIds,
        conflictFixtureIds,
        pendingVerifiedFinalFixtureIds
      }
    });

  const normalizedDownstreamConvergence =
    normalizeDownstreamConvergence(
      downstreamConvergence,
      truthFingerprint
    );

  const observedFlag = (
    section,
    fallback
  ) =>
    typeof section?.observed ===
      "boolean"
      ? section.observed
      : fallback;

  const effectiveHistoryObserved =
    observedFlag(
      normalizedDownstreamConvergence
        ?.history,
      history.observed
    );

  const effectiveSettlementObserved =
    observedFlag(
      normalizedDownstreamConvergence
        ?.settlement,
      settlement.observed
    );

  const effectivePublicationObserved =
    observedFlag(
      normalizedDownstreamConvergence
        ?.publication,
      publication.observed
    );

  const effectiveSystemHealthObserved =
    observedFlag(
      normalizedDownstreamConvergence
        ?.systemHealth,
      systemHealthObserved
    );

  return {
    schema:
      DAY_TRUTH_LEDGER_SCHEMA,

    ledgerVersion:
      DAY_TRUTH_LEDGER_VERSION,

    dayKey:
      exactDayKey,

    generatedAt:
      exactGeneratedAt,

    role:
      DAY_TRUTH_LEDGER_ROLE,

    ledgerState:
      ledgerStateFromSummary(
        summary
      ),

    truthFingerprint,

    authority: {
      ...DAY_TRUTH_LEDGER_AUTHORITY
    },

    summary,

    fixtures,

    anomalies: {
      orphanVerifiedFinals,
      duplicateVerifiedFinalFixtureIds,
      conflictFixtureIds,
      pendingVerifiedFinalFixtureIds
    },

    downstream: {
      historyObserved:
        effectiveHistoryObserved,

      settlementObserved:
        effectiveSettlementObserved,

      publicationObserved:
        effectivePublicationObserved,

      systemHealthObserved:
        effectiveSystemHealthObserved,

      systemHealth:
        cloneJson(
          downstream
            ?.systemHealth
        ),

      convergence:
        normalizedDownstreamConvergence
    },

    provenance: {
      canonical: {
        ...cloneJson(
          provenance
            ?.canonical
        ),

        source:
          cleanNullable(
            provenance
              ?.canonical
              ?.source
          ) ||
          `data/canonical-fixtures/${exactDayKey}`,

        authority:
          "membership_and_operational_state"
      },

      verifiedFinal: {
        ...cloneJson(
          provenance
            ?.verifiedFinal
        ),

        source:
          cleanNullable(
            provenance
              ?.verifiedFinal
              ?.source
          ) ||
          `data/final-results/${exactDayKey}`,

        authority:
          "scored_final_evidence"
      },

      downstream: {
        ...cloneJson(
          provenance
            ?.downstream
        ),

        authority:
          "non_authoritative_observation"
      }
    },

    authorization: {
      canonicalWriteAuthorized:
        false,

      verifiedFinalWriteAuthorized:
        false,

      historyWriteAuthorized:
        false,

      valueSettlementWriteAuthorized:
        false,

      publicationWriteAuthorized:
        false,

      repairAuthorized:
        false
    }
  };
}
