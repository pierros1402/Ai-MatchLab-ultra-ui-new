import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "../core/checkpoint-aware-targeted-repair-controller.js";

import {
  CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_MODE,
  CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,
  CURRENT_DAY_PUBLICATION_FAILURE_CLASS,
  CURRENT_DAY_PUBLICATION_REPAIR_UNIT,
  DETAILS_ORPHAN_FAILURE_CLASS,
  DETAILS_ORPHAN_REPAIR_UNIT,
  FRESHNESS_COVERAGE_FAILURE_CLASS,
  FRESHNESS_COVERAGE_REPAIR_UNIT,
  CANONICAL_SUPPRESSED_ALIAS_FAILURE_CLASS,
  CANONICAL_SUPPRESSED_ALIAS_REPAIR_UNIT,
  LIVE_STATUS_STALE_OPEN_FAILURE_CLASS,
  LIVE_STATUS_STALE_OPEN_REPAIR_UNIT,
  VALUE_COMPARISON_REPAIR_UNIT,
  VALUE_COMPARISON_STALE_FAILURE_CLASS,
  buildCheckpointAwareTargetedRepairExecutorContract,
  checkpointAwareTargetedRepairExecutorContractFingerprint
} from "../core/checkpoint-aware-targeted-repair-executor-contract.js";

import {
  classifyCheckpointAwareTargetedPublicationInspection
} from "../core/checkpoint-aware-targeted-publication-inspection.js";

import {
  compareValueComparisonRepairCandidateSemantics,
  normalizeValueComparisonRepairSemanticPayload
} from "../jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js";

import {
  buildCheckpointAwareTargetedDetailsOrphanCleanupPlan
} from "../core/checkpoint-aware-targeted-details-orphan-cleanup-plan.js";

import {
  classifyCheckpointAwareFreshnessCoverageReadinessPlan
} from "../core/checkpoint-aware-targeted-freshness-coverage-readiness-plan.js";

import {
  classifyCheckpointAwareCanonicalSuppressionPlan
} from "../core/checkpoint-aware-targeted-canonical-suppression-plan.js";

import {
  classifyCheckpointAwareTargetedLiveTerminalRepairPlan
} from "../core/checkpoint-aware-targeted-live-terminal-repair-plan.js";

const DAY =
  "2026-09-22";

const AT =
  "2026-09-22T18:00:00.000Z";

const HEAD =
  "d42d365f77fd2f58e4f659dee2e72b9eeef2ea69";

function publicationDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "current_manifest_missing"
    ]
  });
}

function liveStatusDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "live_status_stale_open_exact_provider_ids:401841449"
    ]
  });
}

function canonicalSuppressionDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "canonical_suppressed_alias_present"
    ]
  });
}

function freshnessCoverageDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "snapshot_stale_against_coverage_readiness"
    ]
  });
}

function detailsOrphanDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      {
        code:
          "details_value_mirror_violation",
        details: {
          violationCode:
            "source_detail_extra_file"
        }
      }
    ]
  });
}

function comparisonDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "value_plan_comparison_stale_against_canonical"
    ]
  });
}

test(
  "value comparison stale decision maps to exact dry-run-only executor contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      VALUE_COMPARISON_STALE_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      VALUE_COMPARISON_REPAIR_UNIT
    );

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "executor contract allows only day comparison and cumulative repository outputs after future authorization",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.deepEqual(
      contract
        .repairContract
        .allowedRepositoryOutputsAfterFutureAuthorization,
      [
        `data/value-comparison/${DAY}.json`,
        "data/value-comparison/cumulative.json"
      ]
    );

    assert.equal(
      contract
        .repairContract
        .outputScope,
      "EXACT_PATHS_ONLY"
    );
  }
);

test(
  "executor contract forbids model details canonical truth push and deploy mutation",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    for (
      const forbidden of [
        "rebuild_value_model",
        "rebuild_details",
        "mutate_canonical_fixture_truth",
        "mutate_final_result_truth",
        "full_daily_cycle",
        "push",
        "deploy"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "no-repair decision cannot instantiate executor contract",
  () => {
    const decision =
      buildCheckpointAwareTargetedRepairControllerDecision({
        dayKey:
          DAY,
        generatedAt:
          AT,
        expectedRemoteHead:
          HEAD,
        observedRemoteHead:
          HEAD,
        signals:
          []
      });

    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairExecutorContract({
          decision
        }),
      /decision_state_not_requestable/u
    );
  }
);

test(
  "forged unimplemented bounded route fails closed instead of borrowing another executor",
  () => {
    const decision = {
      ...comparisonDecision(),
      failureClass:
        "FORGED_UNIMPLEMENTED_FAILURE_CLASS",
      repairUnit:
        "forged_unimplemented_repair_unit"
    };

    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairExecutorContract({
          decision
        }),
      /route_not_implemented/u
    );
  }
);

test(
  "executor contract fingerprint is deterministic and self-consistent",
  () => {
    const a =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    const b =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.equal(
      a.contractFingerprint,
      b.contractFingerprint
    );

    assert.equal(
      a.contractFingerprint,
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        a
      )
    );
  }
);

test(
  "semantic normalization removes temp-path provenance from day and cumulative candidates",
  () => {
    const day =
      normalizeValueComparisonRepairSemanticPayload({
        payload: {
          generatedAt:
            "2026-09-23T03:00:00.000Z",
          inputs: {
            outputPath:
              "../Users/pierr/AppData/Local/Temp/x/value-comparison/2026-09-23.json"
          },
          plans: {
            A: {
              summary: {
                picks:
                  1
              }
            }
          }
        },
        kind:
          "day",
        dayKey:
          "2026-09-23"
      });

    assert.equal(
      day.inputs.outputPath,
      "data/value-comparison/2026-09-23.json"
    );

    const cumulative =
      normalizeValueComparisonRepairSemanticPayload({
        payload: {
          historicalStatisticsCorrection: {
            ledgerPath:
              "../Users/pierr/AppData/Local/Temp/x/value-comparison/historical-exclusions.json"
          }
        },
        kind:
          "cumulative",
        dayKey:
          "2026-09-23"
      });

    assert.equal(
      cumulative
        .historicalStatisticsCorrection
        .ledgerPath,
      "data/value-comparison/historical-exclusions.json"
    );
  }
);

test(
  "semantic comparator ignores generatedAt and temp provenance but still detects real payload changes",
  () => {
    const production = {
      generatedAt:
        "2026-09-23T02:00:00.000Z",
      inputs: {
        outputPath:
          "data/value-comparison/2026-09-23.json"
      },
      plans: {
        A: {
          summary: {
            picks:
              1
          }
        }
      }
    };

    const candidateProvenanceOnly = {
      generatedAt:
        "2026-09-23T03:00:00.000Z",
      inputs: {
        outputPath:
          "../Temp/value-comparison/2026-09-23.json"
      },
      plans: {
        A: {
          summary: {
            picks:
              1
          }
        }
      }
    };

    const same =
      compareValueComparisonRepairCandidateSemantics({
        production,
        candidate:
          candidateProvenanceOnly,
        kind:
          "day",
        dayKey:
          "2026-09-23"
      });

    assert.equal(
      same.semanticChange,
      false
    );

    assert.deepEqual(
      same.semanticDiffPaths,
      []
    );

    const candidateRealChange =
      structuredClone(
        candidateProvenanceOnly
      );

    candidateRealChange
      .plans
      .A
      .summary
      .picks =
        2;

    const changed =
      compareValueComparisonRepairCandidateSemantics({
        production,
        candidate:
          candidateRealChange,
        kind:
          "day",
        dayKey:
          "2026-09-23"
      });

    assert.equal(
      changed.semanticChange,
      true
    );

    assert.deepEqual(
      changed.semanticDiffPaths,
      [
        "$.plans.A.summary.picks"
      ]
    );
  }
);

test(
  "current-day publication decision maps to read-only inspection with zero output authority",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          publicationDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_PUBLICATION_INSPECTION_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      CURRENT_DAY_PUBLICATION_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      CURRENT_DAY_PUBLICATION_REPAIR_UNIT
    );

    assert.deepEqual(
      contract
        .repairContract
        .allowedRepositoryOutputsAfterFutureAuthorization,
      []
    );

    assert.equal(
      contract
        .authority
        .broadDailyDispatchAuthorized,
      false
    );

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "healthy publication recheck converts a stale missing-artifact trigger into no action",
  () => {
    const inspection =
      classifyCheckpointAwareTargetedPublicationInspection({
        dayKey:
          DAY,
        prepublish: {
          ok:
            true,
          blocked:
            []
        },
        final: {
          ok:
            true,
          blocked:
            []
        }
      });

    assert.equal(
      inspection
        .inspectionState,
      "STALE_TRIGGER_NO_ACTION"
    );

    assert.equal(
      inspection
        .firstFailedGate,
      null
    );

    assert.equal(
      inspection
        .broadDailyDispatchAuthorized,
      false
    );
  }
);

test(
  "missing current manifest routes to snapshot verification instead of full Daily dispatch",
  () => {
    const inspection =
      classifyCheckpointAwareTargetedPublicationInspection({
        dayKey:
          DAY,
        prepublish: {
          ok:
            false,
          blocked: [
            {
              code:
                "required_artifact_missing",
              artifact:
                "manifest"
            }
          ]
        },
        final: {
          ok:
            false,
          blocked:
            []
        }
      });

    assert.equal(
      inspection
        .inspectionState,
      "ROUTE_TO_FAILED_GATE"
    );

    assert.equal(
      inspection
        .firstFailedGate,
      "SNAPSHOT_VERIFICATION_GATE"
    );

    assert.equal(
      inspection
        .primaryBlocker
        .artifact,
      "manifest"
    );
  }
);

test(
  "healthy prepublish with missing latest pointer routes only to latest pointer gate",
  () => {
    const inspection =
      classifyCheckpointAwareTargetedPublicationInspection({
        dayKey:
          DAY,
        prepublish: {
          ok:
            true,
          blocked:
            []
        },
        final: {
          ok:
            false,
          blocked: [
            {
              code:
                "latest_missing"
            }
          ]
        }
      });

    assert.equal(
      inspection
        .inspectionState,
      "ROUTE_TO_FAILED_GATE"
    );

    assert.equal(
      inspection
        .firstFailedGate,
      "LATEST_POINTER_GATE"
    );
  }
);

test(
  "unknown publication blocker fails closed instead of guessing a repair gate",
  () => {
    const inspection =
      classifyCheckpointAwareTargetedPublicationInspection({
        dayKey:
          DAY,
        prepublish: {
          ok:
            false,
          blocked: [
            {
              code:
                "future_unknown_publication_failure"
            }
          ]
        },
        final: {
          ok:
            false,
          blocked:
            []
        }
      });

    assert.equal(
      inspection
        .inspectionState,
      "FAIL_CLOSED_QUARANTINE"
    );

    assert.equal(
      inspection
        .broadDailyDispatchAuthorized,
      false
    );
  }
);

test(
  "publication inspection runner contains no workflow dispatch signer push deploy or repository write machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-publication-inspection-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "child_process",
        "gh workflow",
        "workflow_dispatch",
        "git push",
        "git commit",
        "writeFileSync",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `publication inspector must not contain ${forbidden}`
      );
    }
  }
);

test(
  "live stale-open route maps to all-or-nothing exact-provider terminal contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          liveStatusDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      LIVE_STATUS_STALE_OPEN_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      LIVE_STATUS_STALE_OPEN_REPAIR_UNIT
    );

    assert.equal(
      contract
        .repairContract
        .futureOperation,
      "ALL_OR_NOTHING_EXACT_PROVIDER_TERMINAL_WRITEBACK"
    );

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "live terminal contract forbids heuristic partial broad and unverified writes",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          liveStatusDecision()
      });

    assert.equal(
      contract
        .repairContract
        .planner
        .currentBroadLiveRefreshJobAuthorized,
      false
    );

    assert.equal(
      contract
        .repairContract
        .planner
        .hardFailureSuffixIsProviderIdentityAuthority,
      false
    );

    for (
      const forbidden of [
        "heuristic_final_promotion",
        "elapsed_time_final_promotion",
        "partial_terminal_writeback",
        "unverified_status_write",
        "fuzzy_identity_match",
        "cross_day_terminal_promotion",
        "score_fabrication",
        "broad_live_status_refresh_write",
        "full_daily_cycle"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "live terminal planner converts a clean completeness observation into no action",
  () => {
    const plan =
      classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
        dayKey:
          DAY,

        completeness: {
          ok:
            true,
          staleOpenCount:
            0,
          staleOpenFixtures:
            []
        },

        canonicalRows:
          [],

        evidenceRows:
          []
      });

    assert.equal(
      plan.planState,
      "NO_REPAIR_REQUIRED"
    );
  }
);

test(
  "live terminal planner waits all-or-nothing when any stale candidate lacks exact terminal evidence",
  () => {
    const canonicalRows = [
      {
        canonicalId:
          "cid_a",
        matchId:
          "cid_a",
        source:
          "espn",
        sourceId:
          "401841449",
        leagueSlug:
          "test.1",
        kickoffUtc:
          "2026-09-22T12:00:00.000Z",
        homeTeam:
          "Home A",
        awayTeam:
          "Away A",
        status:
          "LIVE",
        statusType:
          "STATUS_IN_PROGRESS",
        rawStatus:
          "STATUS_IN_PROGRESS"
      },
      {
        canonicalId:
          "cid_b",
        matchId:
          "cid_b",
        source:
          "espn",
        sourceId:
          "401841450",
        leagueSlug:
          "test.1",
        kickoffUtc:
          "2026-09-22T14:00:00.000Z",
        homeTeam:
          "Home B",
        awayTeam:
          "Away B",
        status:
          "LIVE",
        statusType:
          "STATUS_IN_PROGRESS",
        rawStatus:
          "STATUS_IN_PROGRESS"
      }
    ];

    const completeness = {
      ok:
        false,
      staleOpenCount:
        2,
      staleOpenFixtures: [
        {
          canonicalId:
            "cid_a",
          providerId:
            "401841449",
          source:
            "espn",
          leagueSlug:
            "test.1",
          kickoffUtc:
            "2026-09-22T12:00:00.000Z",
          classification:
            "stale_open_exact_provider_id"
        },
        {
          canonicalId:
            "cid_b",
          providerId:
            "401841450",
          source:
            "espn",
          leagueSlug:
            "test.1",
          kickoffUtc:
            "2026-09-22T14:00:00.000Z",
          classification:
            "stale_open_exact_provider_id"
        }
      ]
    };

    const evidenceRows = [
      {
        providerMatchId:
          "401841449",
        source:
          "reconciled",
        kickoffUtc:
          "2026-09-22T12:00:00.000Z",
        homeTeam:
          "Home A",
        awayTeam:
          "Away A",
        status:
          "FT",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FULL_TIME",
        scoreHome:
          2,
        scoreAway:
          1
      }
    ];

    const plan =
      classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
        dayKey:
          DAY,
        completeness,
        canonicalRows,
        evidenceRows
      });

    assert.equal(
      plan.planState,
      "WAITING_FOR_COMPLETE_EXACT_PROVIDER_EVIDENCE"
    );

    assert.equal(
      plan.exactTerminalReadyCount,
      1
    );

    assert.equal(
      plan.missingEvidenceCount,
      1
    );

    assert.equal(
      plan
        .safety
        .partialWritebackAuthorized,
      false
    );
  }
);

test(
  "live terminal planner becomes ready only when every stale candidate passes the authoritative writeback gate",
  () => {
    const canonicalRows = [
      {
        canonicalId:
          "cid_test",
        matchId:
          "cid_test",
        source:
          "espn",
        sourceId:
          "401841449",
        leagueSlug:
          "test.1",
        kickoffUtc:
          "2026-09-22T12:00:00.000Z",
        homeTeam:
          "Home Club",
        awayTeam:
          "Away Club",
        status:
          "LIVE",
        statusType:
          "STATUS_IN_PROGRESS",
        rawStatus:
          "STATUS_IN_PROGRESS"
      }
    ];

    const plan =
      classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
        dayKey:
          DAY,

        completeness: {
          ok:
            false,
          staleOpenCount:
            1,
          staleOpenFixtures: [
            {
              canonicalId:
                "cid_test",
              providerId:
                "401841449",
              source:
                "espn",
              leagueSlug:
                "test.1",
              kickoffUtc:
                "2026-09-22T12:00:00.000Z",
              classification:
                "stale_open_exact_provider_id"
            }
          ]
        },

        canonicalRows,

        evidenceRows: [
          {
            providerMatchId:
              "401841449",
            source:
              "reconciled",
            kickoffUtc:
              "2026-09-22T12:00:00.000Z",
            homeTeam:
              "Home Club",
            awayTeam:
              "Away Club",
            status:
              "FT",
            statusType:
              "STATUS_FINAL",
            rawStatus:
              "STATUS_FULL_TIME",
            scoreHome:
              3,
            scoreAway:
              0
          }
        ]
      });

    assert.equal(
      plan.planState,
      "EXACT_TERMINAL_REPAIR_PLAN"
    );

    assert.equal(
      plan.allOrNothingReady,
      true
    );

    assert.equal(
      plan.exactTerminalReadyCount,
      1
    );

    assert.deepEqual(
      plan.candidates[0].terminalDecision,
      {
        providerMatchId:
          "401841449",
        scoreHome:
          3,
        scoreAway:
          0,
        dayKey:
          DAY
      }
    );

    assert.equal(
      plan
        .futureExecutionScope
        .partialWritebackAuthorized,
      false
    );
  }
);

test(
  "live terminal planner fails closed on exact-provider evidence with wrong ordered team identity",
  () => {
    const plan =
      classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
        dayKey:
          DAY,

        completeness: {
          ok:
            false,
          staleOpenCount:
            1,
          staleOpenFixtures: [
            {
              canonicalId:
                "cid_test",
              providerId:
                "401841449",
              source:
                "espn",
              leagueSlug:
                "test.1",
              kickoffUtc:
                "2026-09-22T12:00:00.000Z",
              classification:
                "stale_open_exact_provider_id"
            }
          ]
        },

        canonicalRows: [
          {
            canonicalId:
              "cid_test",
            matchId:
              "cid_test",
            source:
              "espn",
            sourceId:
              "401841449",
            leagueSlug:
              "test.1",
            kickoffUtc:
              "2026-09-22T12:00:00.000Z",
            homeTeam:
              "Home Club",
            awayTeam:
              "Away Club",
            status:
              "LIVE",
            statusType:
              "STATUS_IN_PROGRESS",
            rawStatus:
              "STATUS_IN_PROGRESS"
          }
        ],

        evidenceRows: [
          {
            providerMatchId:
              "401841449",
            source:
              "reconciled",
            kickoffUtc:
              "2026-09-22T12:00:00.000Z",
            homeTeam:
              "Away Club",
            awayTeam:
              "Home Club",
            status:
              "FT",
            statusType:
              "STATUS_FINAL",
            rawStatus:
              "STATUS_FULL_TIME",
            scoreHome:
              1,
            scoreAway:
              2
          }
        ]
      });

    assert.equal(
      plan.planState,
      "FAIL_CLOSED_LIVE_STATUS_STATE"
    );

    assert.equal(
      plan.reason,
      "exact_provider_evidence_contract_violation"
    );

    assert.equal(
      plan
        .fatalEvidenceErrors[0]
        .rejectionReason,
      "ordered_team_identity_mismatch"
    );
  }
);

test(
  "live terminal dry-run runner contains no provider fetch writer workflow signer commit push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-live-terminal-repair-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "fetch(",
        "writeFileSync",
        "renameSync",
        "rmSync",
        "unlinkSync",
        "child_process",
        "gh workflow",
        "workflow_dispatch",
        "git push",
        "git commit",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `live terminal dry-run runner must not contain ${forbidden}`
      );
    }
  }
);

test(
  "canonical suppressed-alias route maps to projection-only dry-run contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          canonicalSuppressionDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      CANONICAL_SUPPRESSED_ALIAS_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      CANONICAL_SUPPRESSED_ALIAS_REPAIR_UNIT
    );

    assert.deepEqual(
      contract
        .repairContract
        .allowedRepositoryOutputsAfterFutureAuthorization,
      []
    );

    assert.equal(
      contract
        .repairContract
        .futureOperation,
      "IN_MEMORY_RESOLVER_MEMBERSHIP_SUPPRESSION_ONLY"
    );
  }
);

test(
  "canonical suppression contract forbids source-truth and resolver-ledger mutation",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          canonicalSuppressionDecision()
      });

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );

    assert.equal(
      contract
        .repairContract
        .planner
        .failedConsumerTargetStatus,
      "REQUIRED_BEFORE_MUTABLE_EXECUTION"
    );

    for (
      const forbidden of [
        "delete_canonical_fixture_source_row",
        "rewrite_canonical_fixture_partition",
        "retarget_identity_resolver_ledger",
        "rewrite_identity_ledger",
        "rewrite_history",
        "full_daily_cycle"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "canonical suppression planner treats raw aliases removed by the membership gate as already healthy",
  () => {
    const plan =
      classifyCheckpointAwareCanonicalSuppressionPlan({
        dayKey:
          DAY,

        observation: {
          observationAvailable:
            true,
          ok:
            true,
          readError:
            null,
          rawSuppressedFixtureIds: [
            "suppressed-a"
          ],
          postGateSuppressedFixtureIds:
            [],
          rawSuppressedAliasCount:
            1,
          postGateSuppressedAliasCount:
            0
        }
      });

    assert.equal(
      plan.planState,
      "NO_REPAIR_REQUIRED"
    );

    assert.equal(
      plan.reason,
      "raw_suppressed_aliases_removed_before_effective_canonical_universe"
    );
  }
);

test(
  "canonical suppression planner produces an exact projection plan only for resolver-confirmed suppressed aliases",
  () => {
    const resolver = {
      resolveFixtureId(
        fixtureId
      ) {
        return {
          ok:
            true,
          sourceRole:
            "suppressed_lineage_alias",
          resolvedFixtureId:
            `retained-${fixtureId}`
        };
      }
    };

    const plan =
      classifyCheckpointAwareCanonicalSuppressionPlan({
        dayKey:
          DAY,

        observation: {
          observationAvailable:
            true,
          ok:
            false,
          readError:
            null,
          rawSuppressedFixtureIds: [
            "suppressed-a"
          ],
          postGateSuppressedFixtureIds: [
            "suppressed-a"
          ]
        },

        resolver
      });

    assert.equal(
      plan.planState,
      "EXACT_SUPPRESSION_PROJECTION_PLAN"
    );

    assert.equal(
      plan.resolutionEvidence.length,
      1
    );

    assert.equal(
      plan
        .resolutionEvidence[0]
        .sourceRole,
      "suppressed_lineage_alias"
    );

    assert.equal(
      plan
        .futureExecutionRecipe[1]
        .sourceTruthMutation,
      false
    );
  }
);

test(
  "canonical suppression planner fails closed when a leaked id is not a suppressed lineage alias",
  () => {
    const resolver = {
      resolveFixtureId() {
        return {
          ok:
            true,
          sourceRole:
            "retained",
          resolvedFixtureId:
            "retained-id"
        };
      }
    };

    const plan =
      classifyCheckpointAwareCanonicalSuppressionPlan({
        dayKey:
          DAY,

        observation: {
          observationAvailable:
            true,
          ok:
            false,
          readError:
            null,
          rawSuppressedFixtureIds:
            [],
          postGateSuppressedFixtureIds: [
            "unexpected-id"
          ]
        },

        resolver
      });

    assert.equal(
      plan.planState,
      "FAIL_CLOSED_IDENTITY_STATE"
    );

    assert.equal(
      plan.reason,
      "leaked_fixture_id_not_classified_as_suppressed_lineage_alias"
    );
  }
);

test(
  "canonical suppression dry-run runner contains no source mutation signer workflow commit push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-canonical-suppression-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "writeFileSync",
        "renameSync",
        "rmSync",
        "unlinkSync",
        "child_process",
        "gh workflow",
        "workflow_dispatch",
        "git push",
        "git commit",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `canonical suppression dry-run runner must not contain ${forbidden}`
      );
    }
  }
);

test(
  "coverage-readiness freshness route maps to exact dry-run planner contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          freshnessCoverageDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      FRESHNESS_COVERAGE_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      FRESHNESS_COVERAGE_REPAIR_UNIT
    );

    assert.equal(
      contract
        .repairContract
        .planner
        .currentFullSnapshotExporterAuthorized,
      false
    );

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "coverage-readiness contract permits only readiness manifest and freshness outputs while preserving value and details",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          freshnessCoverageDecision()
      });

    assert.deepEqual(
      contract
        .repairContract
        .allowedRepositoryOutputsAfterFutureAuthorization,
      [
        `data/coverage-readiness/${DAY}.json`,
        `data/deploy-snapshots/${DAY}/manifest.json`,
        `data/deploy-snapshots/${DAY}/freshness-report.json`
      ]
    );

    assert.equal(
      contract
        .repairContract
        .mustRemainByteIdentical
        .includes(
          `data/deploy-snapshots/${DAY}/value.json`
        ),
      true
    );

    assert.equal(
      contract
        .repairContract
        .mustRemainByteIdentical
        .includes(
          `data/deploy-snapshots/${DAY}/details/*.json`
        ),
      true
    );

    for (
      const forbidden of [
        "build_details",
        "refresh_value_artifacts",
        "rebuild_value_model",
        "full_snapshot_reexport",
        "promote_latest_pointer",
        "full_daily_cycle"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "coverage-readiness planner accepts only the exact newer-than-manifest freshness condition",
  () => {
    const plan =
      classifyCheckpointAwareFreshnessCoverageReadinessPlan({
        dayKey:
          DAY,

        freshness: {
          ok:
            false,

          manifestGeneratedAt:
            "2026-09-22T10:00:00.000Z",

          reasons: [
            "snapshot_stale_against_coverage_readiness"
          ],

          staleInputs: [
            {
              kind:
                "coverage_readiness",
              artifact:
                `coverage-readiness/${DAY}.json`,
              at:
                "2026-09-22T10:05:00.000Z",
              staleReason:
                "snapshot_stale_against_coverage_readiness",
              newerThanManifestMs:
                300000
            }
          ],

          staleDerivedArtifacts:
            [],

          missingRequiredArtifacts:
            [],

          fourPlanContract: {
            complete:
              true
          }
        }
      });

    assert.equal(
      plan.planState,
      "EXACT_COVERAGE_READINESS_REPAIR_PLAN"
    );

    assert.equal(
      plan
        .futureExecutionRecipe[1]
        .producer,
      "DEDICATED_MANIFEST_ONLY_ADAPTER_REQUIRED"
    );

    assert.equal(
      plan
        .futureExecutionRecipe[1]
        .fullSnapshotExporterAuthorized,
      false
    );
  }
);

test(
  "coverage-readiness planner fails closed on mixed freshness causes or stale derived artifacts",
  () => {
    for (
      const freshness of [
        {
          ok:
            false,

          reasons: [
            "snapshot_stale_against_coverage_readiness",
            "snapshot_stale_against_canonical"
          ],

          staleInputs: [
            {
              kind:
                "coverage_readiness",
              artifact:
                `coverage-readiness/${DAY}.json`,
              staleReason:
                "snapshot_stale_against_coverage_readiness",
              newerThanManifestMs:
                1000
            },
            {
              kind:
                "canonical_fixtures",
              artifact:
                `canonical-fixtures/${DAY}/x.json`,
              staleReason:
                "snapshot_stale_against_canonical",
              newerThanManifestMs:
                1000
            }
          ],

          staleDerivedArtifacts:
            [],

          missingRequiredArtifacts:
            [],

          fourPlanContract: {
            complete:
              true
          }
        },
        {
          ok:
            false,

          reasons: [
            "snapshot_stale_against_coverage_readiness"
          ],

          staleInputs: [
            {
              kind:
                "coverage_readiness",
              artifact:
                `coverage-readiness/${DAY}.json`,
              staleReason:
                "snapshot_stale_against_coverage_readiness",
              newerThanManifestMs:
                1000
            }
          ],

          staleDerivedArtifacts: [
            {
              kind:
                "value_plan_comparison"
            }
          ],

          missingRequiredArtifacts:
            [],

          fourPlanContract: {
            complete:
              true
          }
        }
      ]
    ) {
      const plan =
        classifyCheckpointAwareFreshnessCoverageReadinessPlan({
          dayKey:
            DAY,
          freshness
        });

      assert.equal(
        plan.planState,
        "FAIL_CLOSED_FRESHNESS_STATE"
      );
    }
  }
);

test(
  "coverage-readiness planner converts an already healthy freshness report into no action",
  () => {
    const plan =
      classifyCheckpointAwareFreshnessCoverageReadinessPlan({
        dayKey:
          DAY,

        freshness: {
          ok:
            true,

          reasons:
            [],

          staleInputs:
            [],

          staleDerivedArtifacts:
            [],

          missingRequiredArtifacts:
            [],

          fourPlanContract: {
            complete:
              true
          }
        }
      });

    assert.equal(
      plan.planState,
      "NO_REPAIR_REQUIRED"
    );
  }
);

test(
  "coverage-readiness dry-run runner contains no writer workflow signer commit push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-freshness-coverage-readiness-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "writeFileSync",
        "renameSync",
        "rmSync",
        "unlinkSync",
        "child_process",
        "gh workflow",
        "workflow_dispatch",
        "git push",
        "git commit",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `freshness dry-run runner must not contain ${forbidden}`
      );
    }
  }
);

test(
  "details orphan route maps to exact dry-run-only hash-bound deletion contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          detailsOrphanDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      DETAILS_ORPHAN_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      DETAILS_ORPHAN_REPAIR_UNIT
    );

    assert.equal(
      contract
        .repairContract
        .allowedRepositoryOperationAfterFutureAuthorization,
      "DELETE_ONLY"
    );

    assert.equal(
      contract
        .repairContract
        .outputScope,
      "DYNAMIC_EXACT_HASH_BOUND_CANDIDATE_PATHS_ONLY"
    );
  }
);

test(
  "details orphan contract forbids snapshot deletion rebuilds and broad mutation",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          detailsOrphanDecision()
      });

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );

    for (
      const forbidden of [
        "delete_snapshot_detail",
        "delete_expected_fixture_detail",
        "delete_without_candidate_sha256_match",
        "full_details_rebuild",
        "value_rebuild",
        "full_daily_cycle",
        "commit",
        "push",
        "deploy"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "details orphan planner returns only exact hash-bound source extras and performs no deletion",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-details-orphan-plan-"
        )
      );

    try {
      const expectedFile =
        "cid_expected.json";

      const orphanFile =
        "cid_orphan.json";

      fs.writeFileSync(
        path.join(
          root,
          expectedFile
        ),
        JSON.stringify({
          canonicalId:
            "cid_expected"
        }),
        "utf8"
      );

      fs.writeFileSync(
        path.join(
          root,
          orphanFile
        ),
        JSON.stringify({
          canonicalId:
            "cid_orphan"
        }),
        "utf8"
      );

      const plan =
        buildCheckpointAwareTargetedDetailsOrphanCleanupPlan({
          dayKey:
            DAY,

          sourceDir:
            root,

          fixtures: [
            {
              canonicalId:
                "cid_expected"
            }
          ],

          mirrorReport: {
            ok:
              false,

            counts: {
              fixtures:
                1
            },

            violations: [
              {
                code:
                  "source_detail_extra_file",
                file:
                  orphanFile
              }
            ]
          }
        });

      assert.equal(
        plan.planState,
        "EXACT_ORPHAN_CLEANUP_PLAN"
      );

      assert.equal(
        plan.candidateCount,
        1
      );

      assert.equal(
        plan.candidates[0].relativePath,
        `data/details/${DAY}/${orphanFile}`
      );

      assert.match(
        plan.candidates[0].sha256,
        /^[0-9a-f]{64}$/u
      );

      assert.equal(
        fs.existsSync(
          path.join(
            root,
            orphanFile
          )
        ),
        true,
        "dry-run planner must not delete the orphan"
      );

      assert.equal(
        fs.existsSync(
          path.join(
            root,
            expectedFile
          )
        ),
        true,
        "dry-run planner must not touch expected details"
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);

test(
  "details orphan planner fails closed when extra-file evidence is mixed with any other mirror violation",
  () => {
    const root =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "aiml-details-orphan-mixed-"
        )
      );

    try {
      fs.writeFileSync(
        path.join(
          root,
          "cid_orphan.json"
        ),
        "{}",
        "utf8"
      );

      const plan =
        buildCheckpointAwareTargetedDetailsOrphanCleanupPlan({
          dayKey:
            DAY,

          sourceDir:
            root,

          fixtures:
            [],

          mirrorReport: {
            ok:
              false,

            counts: {
              fixtures:
                0
            },

            violations: [
              {
                code:
                  "source_detail_extra_file",
                file:
                  "cid_orphan.json"
              },
              {
                code:
                  "source_detail_missing_file",
                file:
                  "cid_missing.json"
              }
            ]
          }
        });

      assert.equal(
        plan.planState,
        "FAIL_CLOSED_MIRROR_STATE"
      );

      assert.equal(
        plan.reason,
        "mixed_details_mirror_violations"
      );

      assert.equal(
        plan.candidateCount,
        0
      );
    }
    finally {
      fs.rmSync(
        root,
        {
          recursive:
            true,
          force:
            true
        }
      );
    }
  }
);

test(
  "details orphan planner treats absent source tree as no-action rather than inventing a deletion",
  () => {
    const missing =
      path.join(
        os.tmpdir(),
        `aiml-details-orphan-missing-${process.pid}-${Date.now()}`
      );

    const plan =
      buildCheckpointAwareTargetedDetailsOrphanCleanupPlan({
        dayKey:
          DAY,

        sourceDir:
          missing,

        fixtures:
          [],

        mirrorReport: {
          ok:
            false,

          violations: [
            {
              code:
                "source_detail_extra_file",
              file:
                "cid_orphan.json"
            }
          ]
        }
      });

    assert.equal(
      plan.planState,
      "SOURCE_TREE_UNAVAILABLE_NO_ACTION"
    );

    assert.deepEqual(
      plan.candidates,
      []
    );
  }
);

test(
  "details orphan dry-run runner contains no deletion signer workflow push commit or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-details-orphan-cleanup-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "rmSync",
        "unlinkSync",
        "writeFileSync",
        "renameSync",
        "child_process",
        "gh workflow",
        "workflow_dispatch",
        "git push",
        "git commit",
        "privateKey",
        "sign(",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `details orphan dry-run runner must not contain ${forbidden}`
      );
    }
  }
);

test(
  "dry-run runner is temp-only and contains no git signer workflow push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      source,
      /os\.tmpdir\(\)/u
    );

    assert.match(
      source,
      /fs\.rmSync/u
    );

    for (
      const forbidden of [
        "child_process",
        "git push",
        "gh workflow",
        "RENDER_",
        "privateKey",
        "sign(",
        "deploy hook"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `dry-run runner must not contain ${forbidden}`
      );
    }
  }
);
