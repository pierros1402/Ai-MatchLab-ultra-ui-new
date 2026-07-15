import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHistoryClaim,
  buildHistoryEvidenceFoundation,
  buildHistoryFactIdentity,
  canonicalProvider,
  resolveHistoryFactEvidence
} from "./history-evidence-foundation.js";

const canonicalizer = name => ({
  "Avaí": "Avai",
  "Botafogo-SP": "Botafogo SP",
  "Gimnasia y Esgrima (Jujuy)": "Gimnasia Jujuy"
}[name] || name);

function row(overrides = {}) {
  return {
    id: "espn_1",
    dayKey: "2026-07-12",
    kickoff: "2026-07-12T18:00Z",
    leagueSlug: "arg.2",
    homeTeam: "Gimnasia Jujuy",
    awayTeam: "Chacarita Juniors",
    scoreHome: 1,
    scoreAway: 1,
    status: "STATUS_FULL_TIME",
    source: "espn",
    ...overrides
  };
}

test("fact identity is stable across aliases and ISO millisecond formatting", () => {
  const a = buildHistoryFactIdentity(
    row({
      leagueSlug: "bra.2",
      homeTeam: "Botafogo-SP",
      awayTeam: "Avaí",
      kickoff: "2026-07-06T22:00Z",
      dayKey: "2026-07-07"
    }),
    { canonicalizeTeam: canonicalizer }
  );
  const b = buildHistoryFactIdentity(
    row({
      leagueSlug: "bra.2",
      homeTeam: "Botafogo SP",
      awayTeam: "Avai",
      kickoff: "2026-07-06T22:00:00.000Z",
      dayKey: "2026-07-07"
    }),
    { canonicalizeTeam: canonicalizer }
  );

  assert.equal(a.ok, true);
  assert.equal(a.factId, b.factId);
  assert.equal(a.factKey, b.factKey);
});

test("legitimate affix-only club name never collapses to empty identity", () => {
  const identity = buildHistoryFactIdentity(row({
    leagueSlug: "esp.1",
    homeTeam: "Athletic Club",
    awayTeam: "Sevilla",
    kickoff: "2025-08-17T17:30Z",
    dayKey: "2025-08-17"
  }));

  assert.equal(identity.ok, true);
  assert.equal(identity.homeKey, "athleticclub");
});

test("orientation is part of fact identity", () => {
  const a = buildHistoryFactIdentity(row(), { canonicalizeTeam: canonicalizer });
  const b = buildHistoryFactIdentity(
    row({
      homeTeam: "Chacarita Juniors",
      awayTeam: "Gimnasia Jujuy"
    }),
    { canonicalizeTeam: canonicalizer }
  );
  assert.notEqual(a.factId, b.factId);
});

test("provider aliases collapse to independent source families", () => {
  assert.equal(canonicalProvider("flashscore_or_native"), "flashscore");
  assert.equal(canonicalProvider("source2"), "api_football");
});

test("two independent direct providers agreeing yields verified", () => {
  const factId = "hfact_test";
  const claims = [
    buildHistoryClaim({ factId, row: row(), provider: "espn" }),
    buildHistoryClaim({
      factId,
      row: row({ id: "fs_1", source: "flashscore" }),
      provider: "flashscore_or_native"
    })
  ];

  const resolution = resolveHistoryFactEvidence({ claims });
  assert.equal(resolution.evidenceStatus, "verified");
  assert.equal(resolution.metrics.independentProviderCount, 2);
  assert.deepEqual(resolution.selectedScore, { home: 1, away: 1 });
});

test("repetition from one provider remains supported, not verified", () => {
  const factId = "hfact_test";
  const claims = [
    buildHistoryClaim({ factId, row: row(), provider: "espn" }),
    buildHistoryClaim({
      factId,
      row: row({ id: "espn_2" }),
      provider: "espn"
    })
  ];

  const resolution = resolveHistoryFactEvidence({ claims });
  assert.equal(resolution.evidenceStatus, "supported");
  assert.equal(resolution.metrics.independentProviderCount, 1);
});

test("direct score disagreement is conflicted and never auto-selected", () => {
  const factId = "hfact_test";
  const claims = [
    buildHistoryClaim({ factId, row: row(), provider: "espn" }),
    buildHistoryClaim({
      factId,
      row: row({ id: "fs_1", scoreHome: 2, source: "flashscore" }),
      provider: "flashscore"
    })
  ];

  const resolution = resolveHistoryFactEvidence({ claims });
  assert.equal(resolution.evidenceStatus, "conflicted");
  assert.equal(resolution.confidence, 0);
  assert.equal(resolution.selectedScore, null);
  assert.equal(resolution.alternatives.length, 2);
});

test("removed duplicate source row is preserved as corroborating evidence", () => {
  const historyPayload = {
    season: "2025-2026",
    days: [{ dayKey: "2026-07-07", rows: [row({
      id: "cid_bra2_botafogosp_avai_20260706",
      leagueSlug: "bra.2",
      homeTeam: "Botafogo SP",
      awayTeam: "Avai",
      kickoff: "2026-07-06T22:00:00.000Z",
      dayKey: "2026-07-07",
      scoreHome: 3,
      scoreAway: 1,
      source: "flashscore"
    })] }]
  };
  const repairPlan = {
    actions: {
      currentHistoryDedup: [{
        actionId: "dedup-1",
        pair: "bra.2|botafogosp|avai",
        retainRow: {
          id: "cid_bra2_botafogosp_avai_20260706",
          operationalDay: "2026-07-07"
        },
        removeRows: [{
          id: "401873996",
          sourceFamily: "espn",
          declaredDay: "2026-07-07",
          operationalDay: "2026-07-07",
          kickoff: "2026-07-06T22:00Z",
          homeTeam: "Botafogo-SP",
          awayTeam: "Avaí",
          scoreHome: 3,
          scoreAway: 1
        }]
      }],
      currentHistoryDayNormalization: []
    },
    blocked: {
      scoreConflicts: [],
      orientationConflicts: [],
      h2hDegradedKeys: []
    }
  };

  const report = buildHistoryEvidenceFoundation({
    historyPayload,
    repairPlan,
    canonicalizeTeam: canonicalizer
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.currentHistoryRows, 1);
  assert.equal(report.summary.claims, 2);
  assert.equal(report.summary.recoveredDuplicateClaims, 1);
  assert.equal(report.summary.byEvidenceStatus.verified, 1);
  assert.deepEqual(report.facts[0].lineage.preservedSourceIds.sort(), [
    "401873996",
    "cid_bra2_botafogosp_avai_20260706"
  ]);
});

test("explicit score block keeps the fact conflicted", () => {
  const historyPayload = {
    season: "2025-2026",
    days: [{ dayKey: "2026-07-12", rows: [
      row({ id: "401843965", source: "espn", scoreHome: 1, scoreAway: 1 }),
      row({
        id: "cid_arg2_gimnasiajujuy_chacaritajuniors_20260712",
        source: "flashscore",
        scoreHome: 2,
        scoreAway: 1
      })
    ] }]
  };
  const repairPlan = {
    actions: { currentHistoryDedup: [], currentHistoryDayNormalization: [] },
    blocked: {
      scoreConflicts: [{
        blockId: "score-conflict-1",
        blockType: "current_history_score_conflict",
        alternatives: [
          { rows: [{ id: "401843965", operationalDay: "2026-07-12" }] },
          { rows: [{
            id: "cid_arg2_gimnasiajujuy_chacaritajuniors_20260712",
            operationalDay: "2026-07-12"
          }] }
        ]
      }],
      orientationConflicts: [],
      h2hDegradedKeys: []
    }
  };

  const report = buildHistoryEvidenceFoundation({
    historyPayload,
    repairPlan,
    canonicalizeTeam: canonicalizer
  });

  assert.equal(report.summary.byEvidenceStatus.conflicted, 1);
  assert.equal(report.guarantees.blockedFactsAutoResolved, 0);
  assert.equal(report.facts[0].resolution.selectedScore, null);
});

test("day normalization action is retained as lineage rather than a truth rewrite", () => {
  const historyPayload = {
    season: "2025-2026",
    days: [{ dayKey: "2026-07-04", rows: [row({
      id: "cid_usa2_loudoun_sportingjax_20260703",
      leagueSlug: "usa.2",
      homeTeam: "Loudoun",
      awayTeam: "Sporting Jax",
      kickoff: "2026-07-03T23:30:00.000Z",
      dayKey: "2026-07-04"
    })] }]
  };
  const repairPlan = {
    actions: {
      currentHistoryDedup: [],
      currentHistoryDayNormalization: [{
        actionId: "day-1",
        row: { id: "cid_usa2_loudoun_sportingjax_20260703" },
        toDay: "2026-07-04"
      }]
    },
    blocked: {
      scoreConflicts: [],
      orientationConflicts: [],
      h2hDegradedKeys: []
    }
  };

  const report = buildHistoryEvidenceFoundation({ historyPayload, repairPlan });
  assert.deepEqual(report.facts[0].lineage.dayNormalizationActionIds, ["day-1"]);
  assert.equal(report.sourceContract.truthWrites, 0);
});
