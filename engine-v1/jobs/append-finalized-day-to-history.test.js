import test from "node:test";
import assert from "node:assert/strict";

import { buildVerifiedHistoryDay } from "./append-finalized-day-to-history.js";

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_test_home_away_20260808",
    matchId: "401000001",
    source: "espn",
    sourceMatchId: "401000001",
    leagueSlug: "test.1",
    leagueName: "Test League",
    kickoffUtc: "2026-08-08T18:00:00Z",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    scoreHome: 2,
    scoreAway: 1,
    ...overrides
  };
}

function finalResult(overrides = {}) {
  return {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    date: "2026-08-08",
    dayKey: "2026-08-08",
    matchId: "cid_test_home_away_20260808",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 2,
    awayScore: 1,
    finalScore: { homeScore: 2, awayScore: 1, scoreKey: "2-1" },
    kickoffUtc: "2026-08-08T18:00:00Z",
    source: "verified-test",
    ...overrides
  };
}

test("builds history only from exact canonical and verified-final parity", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical()],
    finalResultRows: [finalResult()],
    season: "2026-2027",
    rebuiltAt: 1
  });

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "cid_test_home_away_20260808");
  assert.equal(result.rows[0].scoreHome, 2);
  assert.equal(result.rows[0].scoreAway, 1);
  assert.equal(result.rows[0].status, "FT");
  assert.equal(result.rows[0].truthContract.exactScoreParity, true);
});

test("rejects mixed scheduled/final canonical evidence", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ status: "STATUS_SCHEDULED", statusType: "FINAL" })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.reason === "canonical_status_conflict"), true);
});

test("rejects null canonical score instead of coercing it to zero", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ scoreHome: null })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.reason === "canonical_final_numeric_score_required"), true);
});

test("rejects score mismatch and canonical nonterminal final-result drift", () => {
  const scoreMismatch = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical()],
    finalResultRows: [finalResult({ homeScore: 3, finalScore: { homeScore: 3, awayScore: 1 } })],
    season: "2026-2027"
  });
  assert.equal(scoreMismatch.ok, false);
  assert.equal(scoreMismatch.errors.some(error => error.reason === "canonical_verified_final_score_mismatch"), true);

  const nonterminal = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ status: "PRE", rawStatus: "STATUS_SCHEDULED", scoreHome: null, scoreAway: null })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });
  assert.equal(nonterminal.ok, false);
  assert.equal(nonterminal.errors.some(error => error.reason === "verified_final_canonical_nonterminal"), true);
});

test("accepts provider display aliases only after exact canonical match-id parity", () => {
  const c = canonical({
    canonicalId: "cid_alias",
    matchId: "cid_alias",
    leagueSlug: "rus.2",
    homeTeam: "SKA Khabarovsk",
    awayTeam: "S. Kostroma",
    scoreHome: 1,
    scoreAway: 3,
  });
  const f = finalResult({
    matchId: "cid_alias",
    leagueSlug: "rus.2",
    homeTeam: "SKA Khabarovsk",
    awayTeam: "Spartak Kostroma",
    homeScore: 1,
    awayScore: 3,
    scoreHome: 1,
    scoreAway: 3,
    finalScore: { homeScore: 1, awayScore: 3, home: 1, away: 3, scoreKey: "1-3" },
    scoreKey: "1-3",
  });
  const built = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [c],
    finalResultRows: [f],
    season: "2026-2027",
  });
  assert.equal(built.ok, true);
  assert.equal(built.acceptedRows, 1);
});
