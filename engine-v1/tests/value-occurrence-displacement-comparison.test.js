import test from "node:test";
import assert from "node:assert/strict";

import { enrichPick } from "../jobs/build-value-plan-comparison-day.js";

const displacedPick = {
  matchId: "cid_ksa1_alkhaleej_alnassr_20260910",
  leagueSlug: "ksa.1",
  homeTeam: "Al Khaleej",
  awayTeam: "Al Nassr",
  kickoff: "2026-09-10T18:00:00.000Z",
  market: "Over / Under 2.5",
  pick: "Over 2.5"
};

test("verified wrong-day provider occurrence settles VOID without a manufactured score", () => {
  const row = enrichPick(displacedPick, null, null, "plan-a", null, null);

  assert.equal(row.result, "VOID");
  assert.equal(row.finalScore, null);
  assert.equal(row.finalStatus, "STATUS_OCCURRENCE_MOVED_OTHER_DAY");
  assert.equal(row.finalStatusType, "STATUS_OCCURRENCE_MOVED_OTHER_DAY");
  assert.equal(row.finalResultProvenance?.verifiedOccurrenceDisplacement, true);
  assert.equal(row.finalResultProvenance?.providerMatchId, "401900921");
  assert.equal(row.finalResultProvenance?.originalDayKey, "2026-09-10");
  assert.equal(row.finalResultProvenance?.authoritativeDayKey, "2026-09-12");
});

test("verified final result takes precedence over occurrence-displacement fallback", () => {
  const finalResult = {
    verifiedFinalTruth: true,
    matchId: displacedPick.matchId,
    finalTruthVerdict: "verified_final_result",
    finalScore: {
      homeScore: 2,
      awayScore: 1,
      scoreKey: "2-1"
    },
    verification: {
      method: "test_verified_final",
      authority: "test"
    }
  };

  const row = enrichPick(displacedPick, null, finalResult, "plan-a", null, null);
  assert.equal(row.result, "WIN");
  assert.deepEqual(row.finalScore, { homeScore: 2, awayScore: 1, scoreKey: "2-1" });
  assert.notEqual(row.finalResultProvenance?.verifiedOccurrenceDisplacement, true);
});

test("generic orphan pick remains unresolved", () => {
  const row = enrichPick({
    ...displacedPick,
    matchId: "cid_ksa1_generic_orphan_20260910",
    homeTeam: "Generic Home",
    awayTeam: "Generic Away"
  }, null, null, "plan-a", null, null);

  assert.equal(row.result, "UNRESOLVED");
  assert.equal(row.finalScore, null);
  assert.equal(row.finalResultProvenance, null);
});
