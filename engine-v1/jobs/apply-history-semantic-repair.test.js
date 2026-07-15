import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicHistoryExecution,
  sha256Json
} from "./apply-history-semantic-repair.js";

function historyDocument() {
  return {
    season: "2025-2026",
    days: [
      {
        dayKey: "2026-07-03",
        matchCount: 3,
        rows: [
          {
            id: "cid_match",
            dayKey: "2026-07-03",
            kickoff: "2026-07-03T22:30:00.000Z",
            kickoff_ms: Date.parse("2026-07-03T22:30:00.000Z"),
            leagueSlug: "x.1",
            homeTeam: "Home FC",
            awayTeam: "Away FC",
            scoreHome: 2,
            scoreAway: 1
          },
          {
            id: "espn_match",
            dayKey: "2026-07-03",
            kickoff: "2026-07-03T22:30Z",
            kickoff_ms: Date.parse("2026-07-03T22:30Z"),
            leagueSlug: "x.1",
            homeTeam: "Home FC ESPN",
            awayTeam: "Away FC ESPN",
            scoreHome: 2,
            scoreAway: 1
          },
          {
            id: "move_only",
            dayKey: "2026-07-03",
            kickoff: "2026-07-03T23:30:00.000Z",
            kickoff_ms: Date.parse("2026-07-03T23:30:00.000Z"),
            leagueSlug: "x.1",
            homeTeam: "Late Home",
            awayTeam: "Late Away",
            scoreHome: 0,
            scoreAway: 0
          }
        ]
      },
      {
        dayKey: "2026-07-04",
        matchCount: 1,
        rows: [
          {
            id: "untouched",
            dayKey: "2026-07-04",
            kickoff: "2026-07-04T12:00:00.000Z",
            kickoff_ms: Date.parse("2026-07-04T12:00:00.000Z"),
            leagueSlug: "x.1",
            homeTeam: "Other",
            awayTeam: "Other 2",
            scoreHome: 1,
            scoreAway: 1
          }
        ]
      }
    ]
  };
}

function selector(row, sourceFamily = "test") {
  return {
    id: row.id,
    sourceFamily,
    declaredDay: row.dayKey,
    operationalDay: row.dayKey,
    kickoff: row.kickoff,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    container: "history/2025-2026.json"
  };
}

function repairPlan() {
  const doc = historyDocument();
  const retain = selector(doc.days[0].rows[0], "canonical");
  retain.operationalDay = "2026-07-04";
  const remove = selector(doc.days[0].rows[1], "espn");
  remove.operationalDay = "2026-07-04";
  const move = selector(doc.days[0].rows[2]);
  move.operationalDay = "2026-07-04";

  return {
    ok: true,
    readyToApply: false,
    schema: "ai-matchlab.history-semantic-repair-plan.v1",
    generatedAt: "2026-07-15T00:00:00.000Z",
    summary: {
      blocked: {
        currentHistoryScoreConflicts: 1,
        currentHistoryFlippedOrientationGroups: 0,
        h2hDegradedPairKeys: 0,
        total: 1
      },
      deferred: {
        historyArchiveSemanticDuplicateGroups: 10,
        resultsMemorySemanticDuplicateGroups: 3,
        resultsMemoryOrphanMatchIds: 2
      }
    },
    actions: {
      currentHistoryDedup: [
        {
          actionId: "current-history-dedup-0001",
          actionType: "deduplicate_current_history_same_score",
          confidence: "deterministic",
          retainRow: retain,
          removeRows: [remove],
          normalizeRetainedDay: {
            from: "2026-07-03",
            to: "2026-07-04",
            moveDayBucket: true
          }
        }
      ],
      currentHistoryDayNormalization: [
        {
          actionId: "current-history-day-normalization-0001",
          actionType: "normalize_current_history_operational_day",
          confidence: "deterministic_timezone_contract",
          row: move,
          fromDay: "2026-07-03",
          toDay: "2026-07-04",
          moveDayBucket: true
        }
      ]
    },
    blocked: { scoreConflicts: [{}], orientationConflicts: [], h2hDegradedKeys: [] },
    deferred: {},
    guarantees: { truthWrites: 0, truthFilesChanged: 0 }
  };
}

test("dry execution removes exact duplicate and moves both day-normalization rows", () => {
  const plan = repairPlan();
  const source = historyDocument();
  const execution = buildDeterministicHistoryExecution({
    planReport: plan,
    historyDocuments: new Map([["history/2025-2026.json", source]])
  });
  const output = execution.outputs.get("history/2025-2026.json");
  assert.equal(execution.summary.rowsToRemove, 1);
  assert.equal(execution.summary.rowsToMove, 2);
  assert.equal(execution.summary.blockedItemsPreserved, 1);
  assert.equal(output.days.length, 1);
  assert.equal(output.days[0].dayKey, "2026-07-04");
  assert.equal(output.days[0].matchCount, 3);
  assert.deepEqual(
    output.days[0].rows.map(row => row.id),
    ["cid_match", "move_only", "untouched"]
  );
  assert.equal(output.days[0].rows[0].dayKey, "2026-07-04");
  assert.equal(output.days[0].rows[1].dayKey, "2026-07-04");
});

test("source document is not mutated by dry execution", () => {
  const source = historyDocument();
  const before = sha256Json(source);
  buildDeterministicHistoryExecution({
    planReport: repairPlan(),
    historyDocuments: { "history/2025-2026.json": source }
  });
  assert.equal(sha256Json(source), before);
  assert.equal(source.days[0].rows.length, 3);
});

test("selector drift fails closed instead of deleting an approximate row", () => {
  const source = historyDocument();
  source.days[0].rows[1].scoreAway = 2;
  assert.throws(
    () => buildDeterministicHistoryExecution({
      planReport: repairPlan(),
      historyDocuments: { "history/2025-2026.json": source }
    }),
    /expected exactly one source row, found 0/
  );
});

test("overlapping repair actions are rejected", () => {
  const plan = repairPlan();
  plan.actions.currentHistoryDayNormalization[0].row =
    plan.actions.currentHistoryDedup[0].retainRow;
  assert.throws(
    () => buildDeterministicHistoryExecution({
      planReport: plan,
      historyDocuments: { "history/2025-2026.json": historyDocument() }
    }),
    /Overlapping repair actions rejected/
  );
});

test("non-deterministic action confidence is rejected", () => {
  const plan = repairPlan();
  plan.actions.currentHistoryDedup[0].confidence = "probable";
  assert.throws(
    () => buildDeterministicHistoryExecution({
      planReport: plan,
      historyDocuments: { "history/2025-2026.json": historyDocument() }
    }),
    /Non-deterministic dedup action rejected/
  );
});

test("declared day disambiguates an identical duplicate ID stored in two buckets", () => {
  const source = {
    season: "2025-2026",
    days: [
      {
        dayKey: "2026-07-08",
        matchCount: 1,
        rows: [{
          id: "cid_same",
          dayKey: "2026-07-08",
          kickoff: "2026-07-08T23:00:00.000Z",
          kickoff_ms: Date.parse("2026-07-08T23:00:00.000Z"),
          leagueSlug: "usa.2",
          homeTeam: "Hartford Athletic",
          awayTeam: "Orange County SC",
          scoreHome: 2,
          scoreAway: 2
        }]
      },
      {
        dayKey: "2026-07-09",
        matchCount: 1,
        rows: [{
          id: "cid_same",
          dayKey: "2026-07-09",
          kickoff: "2026-07-08T23:00:00.000Z",
          kickoff_ms: Date.parse("2026-07-08T23:00:00.000Z"),
          leagueSlug: "usa.2",
          homeTeam: "Hartford Athletic",
          awayTeam: "Orange County SC",
          scoreHome: 2,
          scoreAway: 2
        }]
      }
    ]
  };
  const retain = selector(source.days[1].rows[0]);
  retain.declaredDay = "2026-07-09";
  retain.operationalDay = "2026-07-09";
  const remove = selector(source.days[0].rows[0]);
  remove.declaredDay = "2026-07-08";
  remove.operationalDay = "2026-07-09";
  const plan = {
    ...repairPlan(),
    actions: {
      currentHistoryDedup: [{
        actionId: "current-history-dedup-duplicate-id",
        actionType: "deduplicate_current_history_same_score",
        confidence: "deterministic",
        retainRow: retain,
        removeRows: [remove],
        normalizeRetainedDay: null
      }],
      currentHistoryDayNormalization: []
    }
  };
  const execution = buildDeterministicHistoryExecution({
    planReport: plan,
    historyDocuments: { "history/2025-2026.json": source }
  });
  const output = execution.outputs.get("history/2025-2026.json");
  assert.equal(execution.summary.rowsToRemove, 1);
  assert.equal(output.days.length, 1);
  assert.equal(output.days[0].dayKey, "2026-07-09");
  assert.equal(output.days[0].rows[0].id, "cid_same");
});
