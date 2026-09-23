import {
  evaluateAuthoritativeTerminalWriteback
} from "./authoritative-terminal-writeback.js";

export const CHECKPOINT_AWARE_TARGETED_LIVE_TERMINAL_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-live-terminal-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function canonicalIdOf(row) {
  return clean(
    row?.canonicalId ||
    (
      String(
        row?.matchId ||
        ""
      ).startsWith(
        "cid_"
      )
        ? row?.matchId
        : ""
    )
  );
}

function providerIdOf(row) {
  return clean(
    row?.providerMatchId ||
    row?.sourceId ||
    row?.sourceMatchId ||
    (
      /^\d+$/u.test(
        clean(
          row?.matchId
        )
      )
        ? row?.matchId
        : ""
    )
  );
}

function basePlan({
  dayKey,
  planState,
  reason
}) {
  return {
    schema:
      CHECKPOINT_AWARE_TARGETED_LIVE_TERMINAL_PLAN_SCHEMA,

    dayKey,

    planState,

    reason:
      reason || null,

    exactFailureClass:
      "LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS",

    exactRepairUnit:
      "exact_provider_evidence_all_or_nothing_targeted_terminal_repair",

    allOrNothing:
      true,

    mutableBridgeStatus:
      "DEDICATED_EXACT_PROVIDER_EVIDENCE_TRANSACTION_REQUIRED",

    currentBroadLiveRefreshJobAuthorized:
      false,

    allowedRepositoryOutputsAfterFutureAuthorization:
      [],

    outputScope:
      "NO_REPOSITORY_OUTPUTS_UNTIL_ALL_STALE_CANDIDATES_HAVE_VALID_EXACT_TERMINAL_EVIDENCE",

    forbiddenOperations: [
      "heuristic_final_promotion",
      "elapsed_time_final_promotion",
      "partial_terminal_writeback",
      "unverified_status_write",
      "fuzzy_identity_match",
      "cross_day_terminal_promotion",
      "score_fabrication",
      "append_new_fixtures",
      "broad_live_status_refresh_write",
      "full_daily_cycle",
      "workflow_mutation",
      "commit",
      "push",
      "deploy"
    ],

    safety: {
      readOnly:
        true,

      repositoryWritePerformed:
        false,

      canonicalFixtureMutationPerformed:
        false,

      runtimeFixtureMutationPerformed:
        false,

      snapshotMutationPerformed:
        false,

      partialWritebackAuthorized:
        false,

      heuristicFinalPromotionAuthorized:
        false
    }
  };
}

function buildUniqueIndex(
  rows,
  keyOf
) {
  const index =
    new Map();

  const duplicates =
    new Set();

  for (
    const row of
      Array.isArray(rows)
        ? rows
        : []
  ) {
    const key =
      clean(
        keyOf(row)
      );

    if (!key) {
      continue;
    }

    if (
      index.has(
        key
      )
    ) {
      duplicates.add(
        key
      );

      index.set(
        key,
        null
      );

      continue;
    }

    index.set(
      key,
      row
    );
  }

  return {
    index,
    duplicates: [
      ...duplicates
    ]
      .sort()
  };
}

export function classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
  dayKey,
  completeness,
  canonicalRows = [],
  evidenceRows = []
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "live_terminal_plan_day_invalid"
    );
  }

  if (
    !completeness ||
    typeof completeness !==
      "object" ||
    Array.isArray(
      completeness
    )
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "SOURCE_OBSERVATION_UNAVAILABLE_NO_ACTION",

      reason:
        "live_status_completeness_unavailable"
    });
  }

  const stale =
    Array.isArray(
      completeness
        ?.staleOpenFixtures
    )
      ? completeness
          .staleOpenFixtures
      : [];

  const staleCount =
    Number(
      completeness
        ?.staleOpenCount ||
      0
    );

  if (
    completeness.ok ===
      true &&
    staleCount ===
      0 &&
    stale.length ===
      0
  ) {
    return basePlan({
      dayKey:
        day,

      planState:
        "NO_REPAIR_REQUIRED",

      reason:
        "live_status_completeness_fixed_point_clean"
    });
  }

  if (
    staleCount !==
      stale.length ||
    stale.length ===
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_LIVE_STATUS_STATE",

        reason:
          "stale_open_count_or_fixture_list_inconsistent"
      }),

      observedStaleOpenCount:
        staleCount,

      staleOpenFixtureRows:
        stale.length
    };
  }

  const canonicalIndexState =
    buildUniqueIndex(
      canonicalRows,
      canonicalIdOf
    );

  if (
    canonicalIndexState
      .duplicates
      .length >
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_LIVE_STATUS_STATE",

        reason:
          "duplicate_canonical_ids_in_current_day_universe"
      }),

      duplicateCanonicalIds:
        canonicalIndexState
          .duplicates
    };
  }

  const evidenceIndexState =
    buildUniqueIndex(
      evidenceRows,
      providerIdOf
    );

  if (
    evidenceIndexState
      .duplicates
      .length >
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_LIVE_STATUS_STATE",

        reason:
          "ambiguous_exact_provider_evidence"
      }),

      duplicateProviderIds:
        evidenceIndexState
          .duplicates
    };
  }

  const candidates = [];
  const missingEvidence = [];
  const nonTerminalEvidence = [];
  const fatalEvidenceErrors = [];

  const seenCanonical =
    new Set();

  const seenProvider =
    new Set();

  for (
    const staleRow of
      stale
  ) {
    const canonicalId =
      clean(
        staleRow
          ?.canonicalId
      );

    const providerId =
      clean(
        staleRow
          ?.providerId
      );

    const source =
      clean(
        staleRow
          ?.source
      )
        .toLowerCase();

    if (
      !canonicalId ||
      !providerId ||
      !source.startsWith(
        "espn"
      ) ||
      clean(
        staleRow
          ?.classification
      ) !==
        "stale_open_exact_provider_id"
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_LIVE_STATUS_STATE",

          reason:
            "stale_open_row_missing_exact_provider_identity_contract"
        }),

        staleRow
      };
    }

    if (
      seenCanonical.has(
        canonicalId
      ) ||
      seenProvider.has(
        providerId
      )
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_LIVE_STATUS_STATE",

          reason:
            "duplicate_stale_candidate_identity"
        }),

        canonicalId,
        providerId
      };
    }

    seenCanonical.add(
      canonicalId
    );

    seenProvider.add(
      providerId
    );

    const canonicalRow =
      canonicalIndexState
        .index
        .get(
          canonicalId
        );

    if (
      !canonicalRow
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_LIVE_STATUS_STATE",

          reason:
            "stale_candidate_missing_from_current_canonical_universe"
        }),

        canonicalId,
        providerId
      };
    }

    const canonicalProviderId =
      providerIdOf(
        canonicalRow
      );

    if (
      !canonicalProviderId ||
      canonicalProviderId !==
        providerId
    ) {
      return {
        ...basePlan({
          dayKey:
            day,

          planState:
            "FAIL_CLOSED_LIVE_STATUS_STATE",

          reason:
            "stale_candidate_provider_id_drift"
        }),

        canonicalId,
        staleProviderId:
          providerId,
        canonicalProviderId:
          canonicalProviderId ||
          null
      };
    }

    const evidenceRow =
      evidenceIndexState
        .index
        .get(
          providerId
        );

    const baseCandidate = {
      canonicalId,
      providerId,
      source,
      leagueSlug:
        clean(
          canonicalRow
            ?.leagueSlug
        ) ||
        clean(
          staleRow
            ?.leagueSlug
        ) ||
        null,
      providerLeagueSlug:
        clean(
          staleRow
            ?.providerLeagueSlug
        ) ||
        null,
      kickoffUtc:
        clean(
          canonicalRow
            ?.kickoffUtc
        ) ||
        clean(
          staleRow
            ?.kickoffUtc
        ) ||
        null,
      homeTeam:
        canonicalRow
          ?.homeTeam ||
        null,
      awayTeam:
        canonicalRow
          ?.awayTeam ||
        null,
      evidenceState:
        null,
      terminalDecision:
        null
    };

    if (
      !evidenceRow
    ) {
      missingEvidence.push(
        {
          ...baseCandidate,
          evidenceState:
            "MISSING"
        }
      );

      continue;
    }

    const decision =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow,
        observationRow:
          evidenceRow,
        dayKey:
          day
      });

    if (
      decision.ok ===
        true
    ) {
      candidates.push({
        ...baseCandidate,
        evidenceState:
          "EXACT_TERMINAL_READY",
        terminalDecision: {
          providerMatchId:
            decision
              .providerMatchId,
          scoreHome:
            decision
              .scoreHome,
          scoreAway:
            decision
              .scoreAway,
          dayKey:
            decision
              .dayKey
        }
      });

      continue;
    }

    if (
      [
        "explicit_terminal_status_required",
        "valid_numeric_score_required"
      ]
        .includes(
          decision.reason
        )
    ) {
      nonTerminalEvidence.push({
        ...baseCandidate,
        evidenceState:
          "EXACT_PROVIDER_NOT_TERMINAL_READY",
        rejectionReason:
          decision.reason
      });

      continue;
    }

    fatalEvidenceErrors.push({
      ...baseCandidate,
      evidenceState:
        "INVALID_EXACT_PROVIDER_EVIDENCE",
      rejectionReason:
        decision.reason ||
        "unknown_terminal_evidence_rejection"
    });
  }

  if (
    fatalEvidenceErrors.length >
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "FAIL_CLOSED_LIVE_STATUS_STATE",

        reason:
          "exact_provider_evidence_contract_violation"
      }),

      staleCandidateCount:
        stale.length,

      fatalEvidenceErrors
    };
  }

  if (
    missingEvidence.length >
      0 ||
    nonTerminalEvidence.length >
      0
  ) {
    return {
      ...basePlan({
        dayKey:
          day,

        planState:
          "WAITING_FOR_COMPLETE_EXACT_PROVIDER_EVIDENCE",

        reason:
          "all_or_nothing_terminal_evidence_not_complete"
      }),

      staleCandidateCount:
        stale.length,

      exactTerminalReadyCount:
        candidates.length,

      missingEvidenceCount:
        missingEvidence.length,

      nonTerminalEvidenceCount:
        nonTerminalEvidence.length,

      candidates:
        [
          ...candidates,
          ...missingEvidence,
          ...nonTerminalEvidence
        ]
          .sort(
            (left, right) =>
              left
                .canonicalId
                .localeCompare(
                  right
                    .canonicalId
                )
          ),

      providerEvidenceAcquisition: {
        required:
          true,

        exactProviderIds:
          stale
            .map(
              row =>
                clean(
                  row?.providerId
                )
            )
            .filter(Boolean)
            .sort(),

        providerIdentityAuthority:
          "liveStatusCompleteness.staleOpenFixtures.providerId",

        hardFailureSuffixIsProviderIdentityAuthority:
          false,

        dedicatedAdapterRequired:
          true,

        existingBroadLiveRefreshJobAuthorized:
          false
      }
    };
  }

  const sortedCandidates =
    candidates
      .sort(
        (left, right) =>
          left
            .canonicalId
            .localeCompare(
              right
                .canonicalId
            )
      );

  const canonicalPaths = [
    ...new Set(
      sortedCandidates
        .map(
          row =>
            row.leagueSlug
              ? `data/canonical-fixtures/${day}/${row.leagueSlug}.json`
              : ""
        )
        .filter(Boolean)
    )
  ]
    .sort();

  return {
    ...basePlan({
      dayKey:
        day,

      planState:
        "EXACT_TERMINAL_REPAIR_PLAN",

      reason:
        "all_stale_candidates_have_exact_authoritative_terminal_evidence"
    }),

    allOrNothingReady:
      true,

    staleCandidateCount:
      stale.length,

    exactTerminalReadyCount:
      sortedCandidates.length,

    candidates:
      sortedCandidates,

    futureExecutionScope: {
      canonicalLeagueFiles:
        canonicalPaths,

      runtimeCanonicalSyncRequired:
        true,

      runtimeCanonicalSyncProducer:
        "engine-v1/jobs/sync-canonical-fixtures-to-json-db-day.js",

      snapshotReexportRequired:
        true,

      downstreamResumeCheckpoint:
        "snapshot_reexport_then_downstream_gates",

      partialWritebackAuthorized:
        false
    },

    providerEvidenceAcquisition: {
      required:
        false,

      exactProviderIds:
        sortedCandidates
          .map(
            row =>
              row.providerId
          )
          .sort(),

      providerIdentityAuthority:
        "liveStatusCompleteness.staleOpenFixtures.providerId",

      hardFailureSuffixIsProviderIdentityAuthority:
        false,

      dedicatedAdapterRequired:
        true,

      existingBroadLiveRefreshJobAuthorized:
        false
    }
  };
}
