import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutoCorrectedFinalPayload,
  buildFinalScoreConflictBacklog,
  FINAL_SCORE_REVISION_POLICY,
  isAutoCorrectableFlashscoreRevision,
  markBacklogAutoCorrected
} from "./final-score-revision-backlog.js";

const DAY = "2026-08-08";
const MATCH_ID = "cid_test_home_away_20260808";
const PROVIDER_ID = "fs-proof-1";
const KICKOFF = "2026-08-08T14:00:00.000Z";

function target() {
  return {
    matchId: MATCH_ID,
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: KICKOFF,
    canonicalFixture: {
      canonicalId: MATCH_ID,
      source: "flashscore",
      sourceId: PROVIDER_ID,
      kickoffUtc: KICKOFF
    }
  };
}

function artifact(scoreKey, providerMatchId = PROVIDER_ID) {
  const [home, away] = scoreKey.split("-").map(Number);
  return {
    verifiedFinalTruth: true,
    matchId: MATCH_ID,
    kickoffUtc: KICKOFF,
    scoreKey,
    homeScore: home,
    awayScore: away,
    sources: [{ provider: "flashscore", providerMatchId }]
  };
}

function conflict() {
  return {
    matchId: MATCH_ID,
    homeTeam: "Home",
    awayTeam: "Away",
    existingScore: "1-0",
    newScore: "1-2",
    provider: "flashscore",
    providerMatchId: PROVIDER_ID,
    filePath: `/tmp/${MATCH_ID}.json`,
    autoCorrectionEligible: true
  };
}

test("same exact Flashscore fixture revision is eligible, cross-provider revision is not", () => {
  assert.equal(
    isAutoCorrectableFlashscoreRevision({
      existingArtifact: artifact("1-0"),
      target: target(),
      candidatePayload: artifact("1-2")
    }),
    true
  );

  assert.equal(
    isAutoCorrectableFlashscoreRevision({
      existingArtifact: artifact("1-0"),
      target: target(),
      candidatePayload: artifact("1-2", "different-provider-id")
    }),
    false
  );
});

test("one observation stays pending and a repeated stable observation becomes ready", () => {
  const start = Date.parse("2026-08-08T18:00:00.000Z");
  const first = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    conflicts: [conflict()],
    nowMs: start
  });

  assert.equal(first.summary.active, 1);
  assert.equal(first.activeConflicts[0].state, "PENDING_STABILITY");
  assert.equal(first.activeConflicts[0].observationCount, 1);

  const tooSoon = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    previousBacklog: first,
    conflicts: [conflict()],
    nowMs: start + 30_000
  });
  assert.equal(tooSoon.activeConflicts[0].observationCount, 1);
  assert.equal(tooSoon.activeConflicts[0].state, "PENDING_STABILITY");

  const stable = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    previousBacklog: tooSoon,
    conflicts: [conflict()],
    nowMs: start + FINAL_SCORE_REVISION_POLICY.minStableMs + 1
  });
  assert.equal(stable.activeConflicts[0].observationCount, 2);
  assert.equal(stable.activeConflicts[0].state, "READY_FOR_AUTO_CORRECTION");
});

test("non-eligible conflicts persist for adjudication without becoming auto-correctable", () => {
  const row = { ...conflict(), autoCorrectionEligible: false };
  const report = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    conflicts: [row],
    nowMs: Date.parse("2026-08-08T18:00:00.000Z")
  });

  assert.equal(report.activeConflicts[0].state, "PENDING_ADJUDICATION");
  assert.equal(report.summary.pendingAdjudication, 1);
  assert.equal(report.guarantees.unrelatedFinalsMayProgress, true);
});

test("auto-corrected truth retains revision provenance and leaves the active backlog", () => {
  const start = Date.parse("2026-08-08T18:00:00.000Z");
  const first = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    conflicts: [conflict()],
    nowMs: start
  });
  const ready = buildFinalScoreConflictBacklog({
    dayKey: DAY,
    previousBacklog: first,
    conflicts: [conflict()],
    nowMs: start + FINAL_SCORE_REVISION_POLICY.minStableMs + 1
  });
  const entry = ready.activeConflicts[0];
  const corrected = buildAutoCorrectedFinalPayload(
    artifact("1-2"),
    artifact("1-0"),
    entry,
    start + FINAL_SCORE_REVISION_POLICY.minStableMs + 1
  );

  assert.equal(corrected.scoreKey, "1-2");
  assert.equal(corrected.terminalScoreRevision.state, "APPLIED");
  assert.equal(corrected.terminalScoreRevision.previousScore, "1-0");
  assert.equal(corrected.terminalScoreRevision.correctedScore, "1-2");
  assert.equal(corrected.terminalScoreRevision.observationCount, 2);
  assert.equal(corrected.terminalScoreRevision.oddsUsed, false);

  const closed = markBacklogAutoCorrected(ready, [{ matchId: MATCH_ID }], start + 300_000);
  assert.equal(closed.summary.active, 0);
  assert.equal(closed.resolvedConflicts.at(-1).state, "AUTO_CORRECTED");
});
