import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthoritativeHistoryResolutionExecution,
  canonicalJsonBuffer,
  sha256Buffer
} from "./history-authoritative-resolution-executor.js";

function historyFixture() {
  return {
    schema: "test-history",
    days: [
      {
        dayKey: "2026-05-16",
        matchCount: 2,
        rows: [
          {
            id: "sofa_wrong",
            dayKey: "2026-05-16",
            kickoff: "2026-05-16T16:00:00.000Z",
            leagueSlug: "est.2",
            homeTeam: "Viimsi JK",
            awayTeam: "Nõmme Kalju U21",
            scoreHome: 1,
            scoreAway: 1,
            status: "FT",
            outcome: "DRAW",
            source: "results-memory-recovery"
          },
          {
            id: "sofa_right",
            dayKey: "2026-05-16",
            kickoff: "2026-05-16T16:00:00.000Z",
            leagueSlug: "est.2",
            homeTeam: "Nõmme Kalju U21",
            awayTeam: "Viimsi JK",
            scoreHome: 1,
            scoreAway: 1,
            status: "FT",
            outcome: "DRAW",
            source: "results-memory-recovery"
          }
        ]
      },
      {
        dayKey: "2026-07-12",
        matchCount: 2,
        rows: [
          {
            id: "espn_right",
            dayKey: "2026-07-12",
            kickoff: "2026-07-12T18:00Z",
            leagueSlug: "arg.2",
            homeTeam: "Gimnasia y Esgrima (Jujuy)",
            awayTeam: "Chacarita Juniors",
            scoreHome: 1,
            scoreAway: 1,
            status: "FT",
            outcome: "DRAW",
            source: "espn"
          },
          {
            id: "flash_wrong",
            dayKey: "2026-07-12",
            kickoff: "2026-07-12T18:00:00.000Z",
            leagueSlug: "arg.2",
            homeTeam: "Gimnasia Jujuy",
            awayTeam: "Chacarita Juniors",
            scoreHome: 2,
            scoreAway: 1,
            status: "FT",
            outcome: "HOME",
            source: "flashscore"
          }
        ]
      }
    ]
  };
}

function selector(row, declaredDay) {
  return {
    id: row.id,
    declaredDay,
    operationalDay: declaredDay,
    kickoff: row.kickoff,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    container: "history\\2025-2026.json"
  };
}

function planFixture(history = historyFixture()) {
  const orientationRows = history.days[0].rows;
  const scoreRows = history.days[1].rows;
  return {
    ok: true,
    schema: "ai-matchlab.history-semantic-repair-plan.v1",
    blocked: {
      scoreConflicts: [
        {
          blockId: "score-conflict-0001",
          pair: "arg.2|gimnasiajujuy|chacaritajuniors",
          alternatives: [
            { score: "1|1", rows: [selector(scoreRows[0], "2026-07-12")] },
            { score: "2|1", rows: [selector(scoreRows[1], "2026-07-12")] }
          ]
        }
      ],
      orientationConflicts: [
        {
          blockId: "orientation-conflict-0001",
          pair: "est.2|nommekaljuu21|viimsijk",
          rows: orientationRows.map(row => selector(row, "2026-05-16"))
        }
      ],
      h2hDegradedKeys: [
        { blockId: "h2h-degraded-key-0001" },
        { blockId: "h2h-degraded-key-0002" }
      ]
    }
  };
}

function resolutionRows() {
  return [
    {
      resolutionId: "score-conflict-0001-authoritative-resolution",
      resolutionType: "score",
      blockIds: ["score-conflict-0001"],
      targetFactIds: ["fact-score"],
      proposalStatus: "authoritatively_supported",
      candidate: {
        homeTeam: "Gimnasia Jujuy",
        awayTeam: "Chacarita Juniors",
        homeGoals: 1,
        awayGoals: 1,
        status: "STATUS_FULL_TIME",
        operationalDay: "2026-07-12"
      },
      confidenceClass: "multi_source_corroborated",
      automaticApplyAllowed: false,
      explicitResolutionManifestRequiredForWrite: true,
      evidenceItemCount: 3,
      authoritativeEvidenceCount: 0,
      contradictoryEvidenceCount: 0,
      independentSupportingFamilies: ["a", "b"],
      evidenceDigest: "score-digest"
    },
    {
      resolutionId: "orientation-conflict-0001-authoritative-resolution",
      resolutionType: "orientation",
      blockIds: ["orientation-conflict-0001"],
      targetFactIds: ["fact-right", "fact-wrong"],
      proposalStatus: "authoritatively_supported",
      candidate: {
        retainedFactId: "fact-right",
        suppressedFactIds: ["fact-wrong"],
        homeTeam: "Nomme Kalju U21",
        awayTeam: "Viimsi JK",
        homeGoals: 1,
        awayGoals: 1,
        status: "STATUS_FULL_TIME",
        operationalDay: "2026-05-16",
        kickoffUtc: "2026-05-16T16:00:00.000Z"
      },
      confidenceClass: "authoritative",
      automaticApplyAllowed: false,
      explicitResolutionManifestRequiredForWrite: true,
      evidenceItemCount: 2,
      authoritativeEvidenceCount: 2,
      contradictoryEvidenceCount: 0,
      independentSupportingFamilies: ["official"],
      evidenceDigest: "orientation-digest"
    }
  ];
}

function bundleFixture(rows = resolutionRows()) {
  return {
    ok: true,
    schema: "ai-matchlab.history-authoritative-resolution-bundle.v1",
    summary: { h2hDeferredBlocks: 2 },
    resolution: { resolutions: rows }
  };
}

function regeneratedFixture(rows = resolutionRows()) {
  return { resolutions: JSON.parse(JSON.stringify(rows)) };
}

function run(overrides = {}) {
  const history = overrides.historyPayload || historyFixture();
  const rows = overrides.resolutionRows || resolutionRows();
  return buildAuthoritativeHistoryResolutionExecution({
    historyPayload: history,
    repairPlan: overrides.repairPlan || planFixture(history),
    resolutionBundle: overrides.resolutionBundle || bundleFixture(rows),
    regeneratedResolutionReport:
      overrides.regeneratedResolutionReport || regeneratedFixture(rows),
    manifestSha256: "manifest-hash",
    resolutionBundleSha256: "bundle-hash"
  });
}

test("score resolution retains the correct source row and preserves the conflicting claim", () => {
  const result = run();
  const day = result.outputHistory.days.find(row => row.dayKey === "2026-07-12");
  assert.equal(day.rows.length, 1);
  assert.equal(day.rows[0].id, "espn_right");
  assert.equal(day.rows[0].scoreHome, 1);
  assert.equal(day.rows[0].authoritativeResolution.suppressedClaims.length, 1);
  assert.equal(
    day.rows[0].authoritativeResolution.suppressedClaims[0].row.id,
    "flash_wrong"
  );
});

test("orientation resolution retains official home-away orientation", () => {
  const result = run();
  const day = result.outputHistory.days.find(row => row.dayKey === "2026-05-16");
  assert.equal(day.rows.length, 1);
  assert.equal(day.rows[0].id, "sofa_right");
  assert.equal(day.rows[0].homeTeam, "Nõmme Kalju U21");
  assert.equal(
    day.rows[0].authoritativeResolution.suppressedClaims[0].row.id,
    "sofa_wrong"
  );
});

test("execution preserves both removed provider claims as deterministic lineage", () => {
  const result = run();
  assert.equal(result.summary.rowsRemoved, 2);
  assert.equal(result.summary.rowsAnnotated, 2);
  assert.equal(result.summary.suppressedClaimsPreserved, 2);
  assert.deepEqual(result.summary.changedDays, ["2026-05-16", "2026-07-12"]);
});

test("projected audit clears score and orientation conflicts", () => {
  const result = run();
  assert.deepEqual(result.projectedAudit, {
    rows: 2,
    invalidRows: 0,
    duplicateIds: 0,
    operationalDayMismatches: 0,
    semanticDuplicateGroups: 0,
    scoreConflictGroups: 0,
    flippedOrientationGroups: 0
  });
});

test("execution is deterministic and output hash matches canonical bytes", () => {
  const a = run();
  const b = run();
  assert.equal(a.outputSha256, b.outputSha256);
  assert.equal(a.outputSha256, sha256Buffer(canonicalJsonBuffer(a.outputHistory)));
});

test("source history input is never mutated", () => {
  const source = historyFixture();
  const before = JSON.stringify(source);
  run({ historyPayload: source });
  assert.equal(JSON.stringify(source), before);
});

test("selector drift fails closed", () => {
  const history = historyFixture();
  history.days[1].rows[1].scoreHome = 9;
  assert.throws(
    () => run({ historyPayload: history, repairPlan: planFixture(historyFixture()) }),
    /expected_exactly_one_history_row/
  );
});

test("non-authoritative resolution status is rejected", () => {
  const rows = resolutionRows();
  rows[0].proposalStatus = "insufficient_authoritative_evidence";
  assert.throws(() => run({ resolutionRows: rows }), /resolution_not_authoritatively_supported/);
});

test("resolution regeneration mismatch is rejected", () => {
  const rows = resolutionRows();
  const regenerated = regeneratedFixture(rows);
  regenerated.resolutions[0].candidate.homeGoals = 2;
  assert.throws(
    () => run({ resolutionRows: rows, regeneratedResolutionReport: regenerated }),
    /resolution_bundle_regeneration_mismatch/
  );
});

test("missing repair-plan block is rejected", () => {
  const plan = planFixture();
  plan.blocked.scoreConflicts = [];
  assert.throws(() => run({ repairPlan: plan }), /resolution_block_not_found_in_plan/);
});

test("pre-existing authoritative application is rejected", () => {
  const history = historyFixture();
  history.days[1].rows[0].authoritativeResolution = { resolutionId: "old" };
  assert.throws(
    () => run({ historyPayload: history, repairPlan: planFixture(history) }),
    /history_row_already_has_authoritative_resolution/
  );
});
