import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCanonicalNestedWritebackRepair,
  evaluateCanonicalNestedWritebackRepair
} from "./canonical-nested-writeback-repair.js";

import {
  findCanonicalStatusConflicts
} from "./canonical-status-coherence.js";

function writeback(
  scoreHome = 1,
  scoreAway = 0
) {
  return {
    schema:
      "ai-matchlab.authoritative-terminal-writeback.v1",
    promotedAt:
      "2026-08-08T20:00:00.000Z",
    provider:
      "reconciled",
    providerMatchId:
      "FS1",
    dayKey:
      "2026-08-08",
    identityContract: {
      exactProviderId: true,
      athensDay: true,
      orderedTeamPair: true,
      explicitTerminalStatus: true,
      numericScore: true,
      heuristicIdentity: false
    },
    observation: {
      status:
        "STATUS_SCHEDULED",
      statusType:
        "STATUS_FINAL",
      rawStatus:
        "STATUS_SCHEDULED",
      scoreHome,
      scoreAway
    }
  };
}

function canonical(
  overrides = {}
) {
  return {
    canonicalId:
      "cid_test_home_away_20260808",
    matchId:
      "cid_test_home_away_20260808",
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    source:
      "flashscore",
    sourceId:
      "FS1",
    homeTeam:
      "Home",
    awayTeam:
      "Away",
    kickoffUtc:
      "2026-08-08T18:00:00.000Z",
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
      1,
    scoreAway:
      0,
    authoritativeTerminalWriteback:
      writeback(),
    ...overrides
  };
}

function finalResult(
  overrides = {}
) {
  return {
    verifiedFinalTruth:
      true,
    canonicalId:
      "cid_test_home_away_20260808",
    matchId:
      "cid_test_home_away_20260808",
    dayKey:
      "2026-08-08",
    leagueSlug:
      "tst.1",
    homeTeam:
      "Home",
    awayTeam:
      "Away",
    kickoffUtc:
      "2026-08-08T18:00:00.000Z",
    scoreHome:
      2,
    scoreAway:
      1,
    generatedAt:
      "2026-08-09T00:00:00.000Z",
    sources: [
      {
        provider:
          "flashscore",
        providerMatchId:
          "FS1",
        home:
          "Home",
        away:
          "Away",
        kickoffUtc:
          "2026-08-08T18:00:00.000Z",
        scoreHome:
          2,
        scoreAway:
          1
      }
    ],
    ...overrides
  };
}

test(
  "repairs score-consistent nested-only conflict without external final artifact",
  () => {
    const row =
      canonical();

    const result =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        dayKey:
          "2026-08-08",
        repairedAt:
          "2026-08-14T12:00:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.evaluation.mode,
      "score_consistent_nested_sync"
    );

    assert.deepEqual(
      result.row
        .authoritativeTerminalWriteback
        .observation,
      {
        status:
          "FT",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FINAL",
        scoreHome:
          1,
        scoreAway:
          0
      }
    );

    assert.equal(
      findCanonicalStatusConflicts({
        fixtures:
          [result.row]
      }).length,
      0
    );
  }
);

test(
  "repairs stale nested score only when verified final and exact provider evidence corroborate canonical score",
  () => {
    const row =
      canonical({
        scoreHome:
          2,
        scoreAway:
          1,
        authoritativeTerminalWriteback:
          writeback(
            0,
            0
          )
      });

    const result =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        finalResult:
          finalResult(),
        dayKey:
          "2026-08-08",
        repairedAt:
          "2026-08-14T12:00:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.evaluation.mode,
      "verified_final_invalidates_stale_nested_score"
    );

    assert.deepEqual(
      result.row
        .nestedWritebackCoherenceRepair
        .previousObservation,
      {
        status:
          "STATUS_SCHEDULED",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_SCHEDULED",
        scoreHome:
          0,
        scoreAway:
          0
      }
    );

    assert.equal(
      result.row
        .authoritativeTerminalWriteback
        .observation
        .scoreHome,
      2
    );

    assert.equal(
      result.row
        .authoritativeTerminalWriteback
        .observation
        .scoreAway,
      1
    );
  }
);

test(
  "rejects stale score when exact provider evidence is missing",
  () => {
    const row =
      canonical({
        scoreHome:
          2,
        scoreAway:
          1,
        authoritativeTerminalWriteback:
          writeback(
            0,
            0
          )
      });

    const evaluation =
      evaluateCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        finalResult:
          finalResult({
            sources: []
          }),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "exact_provider_evidence_missing"
    );
  }
);

test(
  "never repairs a top-level canonical conflict through nested-only path",
  () => {
    const row =
      canonical({
        status:
          "STATUS_SCHEDULED",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FINAL"
      });

    const evaluation =
      evaluateCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        finalResult:
          finalResult(),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "top_level_conflict_not_eligible"
    );
  }
);

test(
  "second pass is fixed-point after nested repair",
  () => {
    const first =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          canonical(),
        dayKey:
          "2026-08-08"
      });

    const second =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          first.row,
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      second.changed,
      false
    );

    assert.equal(
      second.reason,
      "canonical_already_coherent"
    );
  }
);

test(
  "accepts prior exact canonical truth repair as authority for stale nested score",
  () => {
    const row =
      canonical({
        scoreHome:
          2,
        scoreAway:
          3,
        authoritativeTerminalWriteback:
          writeback(
            0,
            0
          ),
        canonicalTruthRepair: {
          schema:
            "ai-matchlab.canonical-verified-final-repair.v1",
          repairedAt:
            "2026-08-10T12:26:13.122Z",
          dayKey:
            "2026-08-08",
          canonicalId:
            "cid_test_home_away_20260808",
          method:
            "exact_identity_verified_final_truth_repair",
          verifiedFinalTruth:
            true,
          verifiedFinalScore: {
            home:
              2,
            away:
              3
          },
          scoreWasCopiedFromVerifiedFinal:
            true,
          statusWasNormalizedToTerminal:
            true
        }
      });

    const result =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        dayKey:
          "2026-08-08",
        repairedAt:
          "2026-08-15T03:30:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.evaluation.mode,
      "canonical_truth_repair_invalidates_stale_nested_score"
    );

    assert.deepEqual(
      result.row
        .authoritativeTerminalWriteback
        .observation,
      {
        status:
          "FT",
        statusType:
          "STATUS_FINAL",
        rawStatus:
          "STATUS_FINAL",
        scoreHome:
          2,
        scoreAway:
          3
      }
    );
  }
);

test(
  "accepts applied final-truth adjudication as authority for stale nested score",
  () => {
    const row =
      canonical({
        scoreHome:
          4,
        scoreAway:
          0,
        authoritativeTerminalWriteback:
          writeback(
            0,
            0
          ),
        finalTruthAdjudication: {
          schema:
            "ai-matchlab.final-truth-adjudication.v1",
          adjudicationId:
            "adj_test",
          state:
            "APPLIED",
          appliedAt:
            "2026-08-10T12:26:12.919Z",
          dayKey:
            "2026-08-08",
          matchId:
            "cid_test_home_away_20260808",
          correctedScore: {
            home:
              4,
            away:
              0,
            scoreKey:
              "4-0"
          },
          silentOverwriteForbidden:
            true
        }
      });

    const result =
      applyCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        dayKey:
          "2026-08-08",
        repairedAt:
          "2026-08-15T03:30:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.evaluation.mode,
      "final_truth_adjudication_invalidates_stale_nested_score"
    );

    assert.equal(
      result.row
        .authoritativeTerminalWriteback
        .observation
        .scoreHome,
      4
    );
  }
);

test(
  "rejects malformed prior repair metadata instead of weakening provider evidence",
  () => {
    const row =
      canonical({
        scoreHome:
          2,
        scoreAway:
          3,
        authoritativeTerminalWriteback:
          writeback(
            0,
            0
          ),
        canonicalTruthRepair: {
          schema:
            "ai-matchlab.canonical-verified-final-repair.v1",
          dayKey:
            "2026-08-08",
          canonicalId:
            "cid_test_home_away_20260808",
          method:
            "exact_identity_verified_final_truth_repair",
          verifiedFinalTruth:
            true,
          verifiedFinalScore: {
            home:
              9,
            away:
              9
          },
          scoreWasCopiedFromVerifiedFinal:
            true,
          statusWasNormalizedToTerminal:
            true
        }
      });

    const evaluation =
      evaluateCanonicalNestedWritebackRepair({
        canonicalRow:
          row,
        finalResult:
          finalResult({
            sources:
              []
          }),
        dayKey:
          "2026-08-08"
      });

    assert.equal(
      evaluation.ok,
      false
    );

    assert.equal(
      evaluation.reason,
      "final_score_mismatch"
    );
  }
);
