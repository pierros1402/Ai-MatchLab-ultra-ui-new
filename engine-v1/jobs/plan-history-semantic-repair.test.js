import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistorySemanticRepairPlan,
  selectRetainedDuplicateRow
} from "./plan-history-semantic-repair.js";

function baseAudit() {
  return {
    schema: "ai-matchlab.history-semantic-integrity.v1",
    generatedAt: "2026-07-15T00:00:00.000Z",
    ok: false,
    clean: false,
    issueCounts: { error: 1, warning: 1, info: 0 },
    sourceContract: { timezone: "Europe/Athens" },
    resultsMemory: {
      expiredEntryCount: 2,
      orphanMatchIdCount: 1,
      semantic: { duplicateGroups: 3 },
      affectedLeagues: [
        {
          slug: "arg.2",
          examples: {
            orphanMatchIds: [
              {
                slug: "arg.2",
                matchId: "espn_orphan",
                side: { teamName: "Example" }
              }
            ]
          }
        }
      ]
    },
    historyArchive: {
      semantic: { duplicateGroups: 10 }
    },
    currentHistory: {
      semantic: {
        duplicateGroups: 1,
        examples: {
          semanticDuplicates: [],
          scoreConflicts: [],
          flippedOrientation: []
        }
      },
      examples: {
        duplicateIds: [],
        operationalDayMismatch: []
      }
    },
    h2h: {
      examples: { degradedPairKeys: [] }
    }
  };
}

function duplicateRows() {
  return [
    {
      id: "401873996",
      sourceFamily: "espn",
      declaredDay: "2026-07-07",
      operationalDay: "2026-07-07",
      kickoff: "2026-07-06T22:00Z",
      homeTeam: "Botafogo-SP",
      awayTeam: "Avaí",
      scoreHome: 3,
      scoreAway: 1,
      container: "history/2025-2026.json"
    },
    {
      id: "cid_bra2_botafogosp_avai_20260706",
      sourceFamily: "flashscore_or_native",
      declaredDay: "2026-07-06",
      operationalDay: "2026-07-07",
      kickoff: "2026-07-06T22:00:00.000Z",
      homeTeam: "Botafogo SP",
      awayTeam: "Avai",
      scoreHome: 3,
      scoreAway: 1,
      container: "history/2025-2026.json"
    }
  ];
}

test("canonical ID is retained for same-score duplicate planning", () => {
  const retained = selectRetainedDuplicateRow(duplicateRows());
  assert.equal(retained.id, "cid_bra2_botafogosp_avai_20260706");
});

test("same-score duplicates become deterministic candidates without truth writes", () => {
  const audit = baseAudit();
  audit.currentHistory.semantic.examples.semanticDuplicates.push({
    pair: "bra.2|botafogosp|avai",
    score: "3|1",
    rows: duplicateRows()
  });
  audit.currentHistory.examples.operationalDayMismatch.push(duplicateRows()[1]);

  const plan = buildHistorySemanticRepairPlan({ auditReport: audit });
  assert.equal(plan.summary.deterministicCandidates.currentHistoryDedupGroups, 1);
  assert.equal(plan.summary.deterministicCandidates.currentHistoryRowsToRemove, 1);
  assert.equal(
    plan.summary.deterministicCandidates.currentHistoryDayNormalizationsCoveredByDedup,
    1
  );
  assert.equal(
    plan.summary.deterministicCandidates.currentHistoryDayNormalizationsStandalone,
    0
  );
  assert.equal(plan.actions.currentHistoryDedup[0].retainRow.id,
    "cid_bra2_botafogosp_avai_20260706");
  assert.deepEqual(plan.actions.currentHistoryDedup[0].normalizeRetainedDay, {
    from: "2026-07-06",
    to: "2026-07-07",
    moveDayBucket: true
  });
  assert.equal(plan.guarantees.truthWrites, 0);
});

test("standalone operational-day mismatch is not double-counted", () => {
  const audit = baseAudit();
  audit.currentHistory.examples.operationalDayMismatch.push({
    id: "cid_example",
    sourceFamily: "flashscore_or_native",
    declaredDay: "2026-07-03",
    operationalDay: "2026-07-04",
    kickoff: "2026-07-03T23:30:00.000Z",
    homeTeam: "Home",
    awayTeam: "Away",
    scoreHome: 1,
    scoreAway: 0,
    container: "history/2025-2026.json"
  });

  const plan = buildHistorySemanticRepairPlan({ auditReport: audit });
  assert.equal(plan.actions.currentHistoryDayNormalization.length, 1);
  assert.equal(plan.actions.currentHistoryDayNormalization[0].fromDay, "2026-07-03");
  assert.equal(plan.actions.currentHistoryDayNormalization[0].toDay, "2026-07-04");
});

test("score conflicts remain blocked pending authoritative evidence", () => {
  const audit = baseAudit();
  audit.currentHistory.semantic.examples.scoreConflicts.push({
    pair: "arg.2|gimnasiajujuy|chacaritajuniors",
    scores: [
      { score: "1|1", rows: [{ id: "401843965" }] },
      { score: "2|1", rows: [{ id: "cid_wrong" }] }
    ]
  });

  const plan = buildHistorySemanticRepairPlan({ auditReport: audit });
  assert.equal(plan.readyToApply, false);
  assert.equal(plan.blocked.scoreConflicts.length, 1);
  assert.equal(plan.blocked.scoreConflicts[0].automaticResolutionAllowed, false);
});

test("orientation and degraded H2H keys are blocked, archive/results are deferred", () => {
  const audit = baseAudit();
  audit.currentHistory.semantic.examples.flippedOrientation.push({
    pair: "est.2|nommekaljuu21|viimsijk",
    rows: [{ id: "a" }, { id: "b" }]
  });
  audit.h2h.examples.degradedPairKeys.push({
    actual: "~eemdijk.json",
    expected: "~eemdijk.json",
    teamA: "AFC",
    teamB: "Eemdijk"
  });

  const plan = buildHistorySemanticRepairPlan({ auditReport: audit });
  assert.equal(plan.summary.blocked.currentHistoryFlippedOrientationGroups, 1);
  assert.equal(plan.summary.blocked.h2hDegradedPairKeys, 1);
  assert.equal(plan.summary.deferred.historyArchiveSemanticDuplicateGroups, 10);
  assert.equal(plan.summary.deferred.resultsMemorySemanticDuplicateGroups, 3);
  assert.equal(plan.summary.deferred.resultsMemoryOrphanMatchIds, 1);
  assert.equal(plan.deferred.resultsMemory.orphanExamples.length, 1);
});
