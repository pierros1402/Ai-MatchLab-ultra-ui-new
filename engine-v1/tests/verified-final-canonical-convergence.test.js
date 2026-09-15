import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateVerifiedFinalCanonicalConvergence,
  exactProviderIdsOf
} from "../jobs/promote-verified-final-truth-to-canonical-day.js";

const dayKey = "2026-09-13";

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_cafconfed_rukinzo_durbancity_20260913",
    matchId: "cid_cafconfed_rukinzo_durbancity_20260913",
    source: "espn",
    sourceId: "401905970",
    sourceMatchId: "401905970",
    providerIds: { flashscore: "CKnH1EV1", espn: "401905970" },
    leagueSlug: "caf.confed",
    dayKey,
    kickoffUtc: "2026-09-13T13:00:00.000Z",
    homeTeam: "Rukinzo",
    awayTeam: "Durban City",
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    minute: "0'",
    scoreHome: null,
    scoreAway: null,
    ...overrides
  };
}

function finalResult(overrides = {}) {
  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    dayKey,
    matchId: "cid_cafconfed_rukinzo_durbancity_20260913",
    leagueSlug: "caf.confed",
    homeTeam: "Rukinzo",
    awayTeam: "Durban City",
    homeScore: 1,
    awayScore: 2,
    scoreHome: 1,
    scoreAway: 2,
    kickoffUtc: "2026-09-13T13:00:00.000Z",
    finalTruthVerdict: "verified_final_result",
    sources: [{
      provider: "flashscore",
      providerMatchId: "CKnH1EV1",
      finished: true,
      playedFinal: true,
      home: "Rukinzo (Bur)",
      away: "Durban City (Rsa)",
      scoreHome: 1,
      scoreAway: 2,
      kickoffUtc: "2026-09-13T13:00:00.000Z"
    }],
    ...overrides
  };
}

test("collects exact provider identities from primary and providerIds fields", () => {
  assert.deepEqual(exactProviderIdsOf(canonical()), ["401905970", "CKnH1EV1"]);
});

test("promotes scheduled canonical truth using exact cross-provider verified evidence", () => {
  const result = evaluateVerifiedFinalCanonicalConvergence({
    canonicalRow: canonical(),
    finalResultRow: finalResult(),
    finalResultPath: "data/final-results/2026-09-13/example.json",
    dayKey
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.status, "FT");
  assert.equal(result.row.scoreHome, 1);
  assert.equal(result.row.scoreAway, 2);
  assert.deepEqual(result.matchedProviderIds, ["CKnH1EV1"]);
  assert.equal(result.row.verifiedFinalCanonicalConvergence.guarantees.heuristicIdentity, false);
  assert.equal(result.row.verifiedFinalCanonicalConvergence.guarantees.elapsedTimeInference, false);
});

test("rejects when no exact provider identity intersects", () => {
  const result = evaluateVerifiedFinalCanonicalConvergence({
    canonicalRow: canonical({ providerIds: { espn: "401905970" } }),
    finalResultRow: finalResult(),
    dayKey
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "exact_provider_id_intersection_required");
});

test("never overwrites explicit postponed or other protected non-played state", () => {
  const result = evaluateVerifiedFinalCanonicalConvergence({
    canonicalRow: canonical({ status: "POSTPONED", rawStatus: "STATUS_POSTPONED", minute: null }),
    finalResultRow: finalResult(),
    dayKey
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "canonical_state_not_eligible");
});

test("rejects team, day, missing-score and source-score inconsistencies", () => {
  const team = evaluateVerifiedFinalCanonicalConvergence({
    canonicalRow: canonical(),
    finalResultRow: finalResult({ awayTeam: "Wrong Team" }),
    dayKey
  });
  assert.equal(team.reason, "ordered_team_identity_mismatch");

  const day = evaluateVerifiedFinalCanonicalConvergence({
    canonicalRow: canonical(),
    finalResultRow: finalResult({ dayKey: "2026-09-14", kickoffUtc: "2026-09-14T13:00:00.000Z" }),
    dayKey
  });
  assert.equal(day.reason, "athens_day_mismatch");

  const missingScore = finalResult({ homeScore: null, scoreHome: null });
  const score = evaluateVerifiedFinalCanonicalConvergence({ canonicalRow: canonical(), finalResultRow: missingScore, dayKey });
  assert.equal(score.reason, "verified_final_numeric_score_required");

  const sourceMismatch = finalResult({
    sources: [{
      providerMatchId: "CKnH1EV1",
      finished: true,
      playedFinal: true,
      scoreHome: 9,
      scoreAway: 9,
      kickoffUtc: "2026-09-13T13:00:00.000Z"
    }]
  });
  const source = evaluateVerifiedFinalCanonicalConvergence({ canonicalRow: canonical(), finalResultRow: sourceMismatch, dayKey });
  assert.equal(source.reason, "matched_provider_score_mismatch");
});
